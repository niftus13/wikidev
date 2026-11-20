// public/favicon.svg(원본)에서 favicon.ico(16·32·48)·apple-touch-icon.png(180)·icon-192/512.png를 만든다.
// 호스트에 이미지 도구가 없어 공식 Playwright Docker 이미지의 Chromium headless shell로 SVG를 렌더링한다(npm 패키지 불필요).
// 실행(apps/web에서): docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/work" -w /work \
//   mcr.microsoft.com/playwright:v1.65.1-noble node scripts/generate-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const publicDir = new URL('../public/', import.meta.url).pathname;
const source = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');
// iOS는 홈 화면 아이콘 모서리를 직접 둥글게 자르므로 apple-touch-icon은 투명 모서리 없이 꽉 찬 사각형으로 만든다.
const fullBleed = source.replace(/ rx="[^"]*"/, '');

const shellRoot = '/ms-playwright';
const shellDir = readdirSync(shellRoot).find((name) => name.startsWith('chromium_headless_shell-'));
if (!shellDir) throw new Error('Chromium headless shell not found; run inside the Playwright Docker image.');
const chrome = join(shellRoot, shellDir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
const work = mkdtempSync(join(tmpdir(), 'icons-'));

function render(svg, size) {
  const html = join(work, `icon-${size}.html`);
  const png = join(work, `icon-${size}.png`);
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent"><img src="${dataUri}" width="${size}" height="${size}" style="display:block"></body></html>`);
  execFileSync(chrome, [
    '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--window-size=${size},${size}`, `--screenshot=${png}`, `file://${html}`,
  ], { stdio: 'ignore' });
  const buffer = readFileSync(png);
  // PNG IHDR의 너비·높이로 렌더링 크기를 확인한다.
  if (buffer.readUInt32BE(16) !== size || buffer.readUInt32BE(20) !== size) throw new Error(`unexpected PNG size for ${size}`);
  return buffer;
}

// ICO: PNG 데이터를 그대로 담는 형식(Windows Vista+·모든 최신 브라우저 지원).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

try {
  writeFileSync(join(publicDir, 'favicon.ico'), ico([16, 32, 48].map((size) => ({ size, png: render(source, size) }))));
  writeFileSync(join(publicDir, 'apple-touch-icon.png'), render(fullBleed, 180));
  writeFileSync(join(publicDir, 'icon-192.png'), render(source, 192));
  writeFileSync(join(publicDir, 'icon-512.png'), render(source, 512));
  console.log('generated favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png');
} finally {
  rmSync(work, { recursive: true, force: true });
}
