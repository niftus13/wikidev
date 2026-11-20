import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.ts';
import { parseTrustProxy, securityConfig } from '../src/config.ts';
import { clientAddress } from '../src/controllers/auth.ts';
import type { RedisClient } from '../src/services/auth.ts';

const ORIGIN = 'http://localhost:3000';

// DB 없이 요청 제한 키만 기록한다. 빈 본문 로그인은 DB 조회 전에 400으로 끝난다.
type Login = (xff?: string, expectedStatus?: number) => Promise<string>;

async function withApp(trustProxy: string | undefined, run: (login: Login) => Promise<void>, host = '127.0.0.1') {
  const keys: string[] = [];
  const counts = new Map<string, number>();
  const redis: RedisClient = {
    ping: async () => 'PONG',
    eval: async (_script, options) => {
      const key = options.keys[0]!;
      keys.push(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key)!;
    },
  };
  const app = createApp({} as Pool, redis, { origin: ORIGIN, secureCookie: false, trustProxy: parseTrustProxy(trustProxy) });
  const server = app.listen(0, host);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  const login: Login = async (xff, expectedStatus = 400) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN };
    if (xff !== undefined) headers['x-forwarded-for'] = xff;
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, expectedStatus);
    const key = keys.pop();
    assert.ok(key, 'rate limit key was not recorded');
    return key;
  };
  try {
    await run(login);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('without TRUST_PROXY the rate limit key is the socket address and X-Forwarded-For is ignored', async () => {
  await withApp(undefined, async (login) => {
    assert.equal(await login(), 'auth-rate:login:127.0.0.1');
    assert.equal(await login('203.0.113.9'), 'auth-rate:login:127.0.0.1');
    assert.equal(await login('198.51.100.7, 203.0.113.9'), 'auth-rate:login:127.0.0.1');
  });
});

test('a trusted loopback proxy splits rate limit keys by the forwarded client address', async () => {
  await withApp('loopback', async (login) => {
    assert.equal(await login('203.0.113.9'), 'auth-rate:login:203.0.113.9');
    assert.equal(await login('198.51.100.7'), 'auth-rate:login:198.51.100.7');
    assert.equal(await login(), 'auth-rate:login:127.0.0.1');
  });
});

test('a client over the limit gets 429 while another client behind the same proxy can still log in', async () => {
  await withApp('loopback', async (login) => {
    for (let i = 0; i < 20; i += 1) await login('203.0.113.9');
    assert.equal(await login('203.0.113.9', 429), 'auth-rate:login:203.0.113.9');
    assert.equal(await login('6.6.6.6, 203.0.113.9', 429), 'auth-rate:login:203.0.113.9');
    assert.equal(await login('198.51.100.7'), 'auth-rate:login:198.51.100.7');
  });
});

test('a forged multi-hop X-Forwarded-For only yields the address next to the trusted hop', async () => {
  await withApp('loopback', async (login) => {
    assert.equal(await login('6.6.6.6, 203.0.113.9'), 'auth-rate:login:203.0.113.9');
    assert.equal(await login('6.6.6.6, 7.7.7.7, 127.0.0.1, 203.0.113.9'), 'auth-rate:login:203.0.113.9');
  });
});

test('X-Forwarded-For from an address outside TRUST_PROXY is ignored', async () => {
  await withApp('172.30.0.0/16, 10.0.0.1', async (login) => {
    assert.equal(await login('203.0.113.9'), 'auth-rate:login:127.0.0.1');
  });
});

test('an IPv4 client on a dual-stack socket uses the plain IPv4 key', async (t) => {
  try {
    await withApp(undefined, async (login) => {
      assert.equal(await login('203.0.113.9'), 'auth-rate:login:127.0.0.1');
    }, '::');
  } catch (error) {
    if (error instanceof Error && 'code' in error && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(String(error.code))) {
      t.skip('IPv6 is unavailable');
      return;
    }
    throw error;
  }
});

test('client address normalization folds IPv4-mapped IPv6 only', () => {
  assert.equal(clientAddress('::ffff:172.21.0.5'), '172.21.0.5');
  assert.equal(clientAddress('::FFFF:10.0.0.1'), '10.0.0.1');
  assert.equal(clientAddress('172.21.0.5'), '172.21.0.5');
  assert.equal(clientAddress('2001:db8::1'), '2001:db8::1');
  assert.equal(clientAddress('::ffff:not-an-ip'), '::ffff:not-an-ip');
  assert.equal(clientAddress(undefined), undefined);
});

test('TRUST_PROXY accepts addresses, CIDR ranges and named private ranges', () => {
  assert.equal(parseTrustProxy(undefined), undefined);
  assert.equal(parseTrustProxy(''), undefined);
  assert.equal(parseTrustProxy('  '), undefined);
  assert.deepEqual(parseTrustProxy('loopback'), ['loopback']);
  assert.deepEqual(parseTrustProxy('172.30.0.0/16, 10.0.0.1'), ['172.30.0.0/16', '10.0.0.1']);
  assert.deepEqual(parseTrustProxy('loopback,linklocal,uniquelocal'), ['loopback', 'linklocal', 'uniquelocal']);
  assert.deepEqual(parseTrustProxy('::1,fd00::/8'), ['::1', 'fd00::/8']);
});

test('TRUST_PROXY values that trust every address or are malformed are rejected', () => {
  for (const value of ['true', 'false', '1', '2', '*', 'all', '0.0.0.0/0', '::/0', 'loopback,true', 'loopback,,10.0.0.1',
    '10.0.0.0/33', '10.0.0.0/-1', '10.0.0.0/8/1', '10.0.0.0/', 'fd00::/129', '300.0.0.1', 'example.com', 'Loopback']) {
    assert.throws(() => parseTrustProxy(value), /TRUST_PROXY/, value);
  }
});

test('startup configuration fails when TRUST_PROXY trusts every address', (t) => {
  const saved = { APP_ORIGIN: process.env.APP_ORIGIN, COOKIE_SECURE: process.env.COOKIE_SECURE, TRUST_PROXY: process.env.TRUST_PROXY };
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.APP_ORIGIN = ORIGIN;
  process.env.COOKIE_SECURE = 'false';
  process.env.TRUST_PROXY = 'true';
  assert.throws(() => securityConfig(), /TRUST_PROXY/);
  delete process.env.TRUST_PROXY;
  assert.equal(securityConfig().trustProxy, undefined);
  process.env.TRUST_PROXY = '172.30.0.0/16';
  assert.deepEqual(securityConfig().trustProxy, ['172.30.0.0/16']);
});
