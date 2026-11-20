import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { ImageUploadResponse } from '@wikiblog/dto';
import { databaseOptions } from '../src/config.ts';
import { IMAGE_MAX_BYTES, IMAGE_SPACE_QUOTA_BYTES, declaredImageType, detectImageType } from '../src/services/images.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
function bytes(prefix: number[] | string, size = 64): Buffer {
  const head = typeof prefix === 'string' ? Buffer.from(prefix, 'latin1') : Buffer.from(prefix);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 7)]);
}
const webp = () => bytes('RIFF\0\0\0\0WEBPVP8 ');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test('image signatures decide the stored type', () => {
  assert.equal(detectImageType(bytes(PNG)), 'image/png');
  assert.equal(detectImageType(bytes(JPEG)), 'image/jpeg');
  assert.equal(detectImageType(bytes('GIF87a')), 'image/gif');
  assert.equal(detectImageType(bytes('GIF89a')), 'image/gif');
  assert.equal(detectImageType(webp()), 'image/webp');
  assert.equal(detectImageType(bytes('RIFF\0\0\0\0WAVEfmt ')), null);
  assert.equal(detectImageType(svg), null);
  assert.equal(detectImageType(Buffer.from([0x89, 0x50])), null);
  assert.equal(detectImageType(Buffer.alloc(0)), null);
  assert.equal(declaredImageType('IMAGE/PNG; charset=binary'), 'image/png');
  assert.equal(declaredImageType('image/svg+xml'), null);
  assert.equal(declaredImageType('image/jpg'), null);
  assert.equal(declaredImageType(undefined), null);
});

test('image upload and public read', { skip: process.env.INTEGRATION_TESTS !== '1' }, async () => {
  const pool = mysql.createPool(databaseOptions());
  const suffix = randomBytes(8).toString('hex');
  const email = `image-${suffix}@example.test`;
  const origin = process.env.APP_ORIGIN!;
  const base = 'http://127.0.0.1:4000/api/v1';
  type Auth = { cookie: string; csrf: string; spaceId: string };
  async function upload(data: Uint8Array, contentType: string | undefined, auth?: Partial<Auth>, requestOrigin = origin) {
    const headers: Record<string, string> = { origin: requestOrigin };
    if (contentType) headers['content-type'] = contentType;
    if (auth?.cookie) headers.cookie = auth.cookie;
    if (auth?.csrf) headers['x-csrf-token'] = auth.csrf;
    return fetch(`${base}/me/images`, { method: 'POST', headers, body: data });
  }
  async function errorOf(response: Response) {
    return { status: response.status, body: await response.json() as { error: string } };
  }
  try {
    const registered = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, handle: `img-${suffix}`, password: 'integration-password-123' }),
    });
    assert.equal(registered.status, 201);
    const cookie = registered.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const session = await registered.json() as { csrfToken: string; space: { id: string } };
    const auth: Auth = { cookie, csrf: session.csrfToken, spaceId: session.space.id };

    // 인증·CSRF·Origin
    assert.equal((await upload(bytes(PNG), 'image/png')).status, 401);
    assert.equal((await upload(bytes(PNG), 'image/png', { cookie })).status, 403);
    assert.equal((await upload(bytes(PNG), 'image/png', auth, 'https://evil.example')).status, 403);

    // 정상 업로드 4종과 조회 헤더
    const png = bytes(PNG, 300);
    const created = await upload(png, 'image/png', auth);
    assert.equal(created.status, 201);
    const image = await created.json() as ImageUploadResponse;
    assert.match(image.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.deepEqual(image, { id: image.id, url: `/api/v1/images/${image.id}`, contentType: 'image/png', byteSize: 300 });
    const [stored] = await pool.execute<RowDataPacket[]>('SELECT space_id, sha256, byte_size FROM images WHERE id = ?', [image.id]);
    assert.equal(stored[0]?.space_id, auth.spaceId, 'upload is stored in the session owner space');
    assert.match(String(stored[0]?.sha256), /^[0-9a-f]{64}$/);
    const read = await fetch(`http://127.0.0.1:4000${image.url}`);
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('content-type'), 'image/png');
    assert.equal(read.headers.get('content-length'), '300');
    assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(read.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(read.headers.get('content-disposition'), 'inline');
    assert.equal(read.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), png);
    for (const [data, type] of [[bytes(JPEG), 'image/jpeg'], [bytes('GIF89a'), 'image/gif'], [webp(), 'image/webp']] as const) {
      const response = await upload(data, type, auth);
      assert.equal(response.status, 201, type);
      const body = await response.json() as ImageUploadResponse;
      assert.equal(body.contentType, type);
      assert.equal((await fetch(`http://127.0.0.1:4000${body.url}`)).headers.get('content-type'), type);
    }

    // 형식 거부: 미허용 선언 415, 시그니처 불일치·위장·빈 본문 400
    assert.equal((await upload(svg, 'image/svg+xml', auth)).status, 415);
    assert.equal((await upload(bytes(PNG), 'application/octet-stream', auth)).status, 415);
    assert.equal((await upload(bytes(PNG), 'text/plain', auth)).status, 415);
    assert.equal((await upload(Buffer.from('{}'), 'application/json', auth)).status, 415);
    assert.equal((await upload(bytes(PNG), undefined, auth)).status, 415);
    assert.deepEqual(await errorOf(await upload(svg, 'image/png', auth)), { status: 400, body: { error: 'Image content does not match Content-Type' } });
    assert.equal((await upload(bytes(JPEG), 'image/png', auth)).status, 400);
    assert.equal((await upload(Buffer.from('<html><script>1</script></html>'), 'image/gif', auth)).status, 400);
    assert.equal((await upload(new Uint8Array(0), 'image/png', auth)).status, 400);

    // 크기 상한: 정확히 2 MiB는 허용, 1바이트 초과는 413
    assert.equal((await upload(bytes(PNG, IMAGE_MAX_BYTES), 'image/png', auth)).status, 201);
    assert.deepEqual(await errorOf(await upload(bytes(PNG, IMAGE_MAX_BYTES + 1), 'image/png', auth)), { status: 413, body: { error: 'Request body too large' } });

    // 공간 총량: 남은 용량을 1.5 MiB로 맞춘 뒤 1 MiB 두 장을 동시에 올리면 한 장만 성공한다.
    const used = async () => {
      const [rows] = await pool.execute<RowDataPacket[]>('SELECT COALESCE(SUM(byte_size), 0) AS used FROM images WHERE space_id = ?', [auth.spaceId]);
      return Number(rows[0]?.used);
    };
    const filler = IMAGE_SPACE_QUOTA_BYTES - (await used()) - 1.5 * 1024 * 1024;
    await pool.execute('INSERT INTO images (id, space_id, content_type, byte_size, sha256, data) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), auth.spaceId, 'image/png', filler, '0'.repeat(64), Buffer.from(PNG)]);
    const race = await Promise.all([upload(bytes(PNG, 1024 * 1024), 'image/png', auth), upload(bytes(PNG, 1024 * 1024), 'image/png', auth)]);
    assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
    assert.ok((await used()) <= IMAGE_SPACE_QUOTA_BYTES);
    assert.deepEqual(await errorOf(await upload(bytes(PNG, 1024 * 1024), 'image/png', auth)), { status: 409, body: { error: 'Image storage quota exceeded' } });
    assert.equal((await upload(bytes(PNG, 1024), 'image/png', auth)).status, 201, 'smaller image still fits');

    // 조회 404: 형식 오류·없음·비활성 소유자. 오류 응답은 캐시하지 않는다.
    const invalid = await fetch(`${base}/images/not-a-uuid`);
    assert.equal(invalid.status, 404);
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${base}/images/${randomUUID()}`)).status, 404);
    assert.equal((await fetch(`${base}/images/${image.id.toUpperCase()}`)).status, 404);
    await pool.execute("UPDATE users SET status = 'disabled' WHERE email = ?", [email]);
    const hidden = await fetch(`http://127.0.0.1:4000${image.url}`);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.headers.get('cache-control'), 'no-store');
  } finally {
    const [users] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [email]);
    for (const user of users) {
      await pool.execute('DELETE i FROM images i JOIN spaces s ON s.id = i.space_id WHERE s.owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM spaces WHERE owner_id = ?', [user.id]);
      await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    }
    await pool.end();
  }
});
