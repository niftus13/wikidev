import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiProxyHeaders,
  apiProxyTimeoutMs,
  DEFAULT_API_PROXY_TIMEOUT_MS,
  isUpstreamTimeout,
  parseWebTrustProxy,
  proxyClientAddress,
  resetForwardedFor,
  trustedClientAddress,
  webTrustProxy,
} from '../server/utils/apiProxy.ts';
import { parseTrustProxy } from '../../api/src/config.ts';

test('proxy headers drop forged client address headers and set X-Forwarded-For to the seen address', () => {
  const headers = apiProxyHeaders({
    'x-forwarded-for': '6.6.6.6, 7.7.7.7',
    'x-real-ip': '6.6.6.6',
    forwarded: 'for=6.6.6.6',
    'x-forwarded-host': 'evil.example',
    'x-forwarded-proto': 'https',
    'x-forwarded-port': '443',
  }, '172.21.0.1');
  assert.deepEqual(headers, { 'x-forwarded-for': '172.21.0.1' });
});

test('proxy headers keep cookies, CSRF token, Origin and Content-Type', () => {
  const headers = apiProxyHeaders({
    cookie: 'wikiblog_session=abc; other=1',
    'x-csrf-token': 'token',
    origin: 'http://localhost:3000',
    'content-type': 'application/json',
    'content-length': '2',
    'user-agent': 'test',
    host: 'localhost:3000',
    connection: 'keep-alive',
    accept: '*/*',
  }, '203.0.113.9');
  assert.deepEqual(headers, {
    cookie: 'wikiblog_session=abc; other=1',
    'x-csrf-token': 'token',
    origin: 'http://localhost:3000',
    'content-type': 'application/json',
    'content-length': '2',
    'user-agent': 'test',
    'x-forwarded-for': '203.0.113.9',
  });
});

test('proxy headers omit X-Forwarded-For when the client address is unknown or invalid', () => {
  assert.deepEqual(apiProxyHeaders({ 'x-forwarded-for': '6.6.6.6' }, undefined), {});
  assert.deepEqual(apiProxyHeaders({ 'x-forwarded-for': '6.6.6.6' }, ''), {});
  assert.deepEqual(apiProxyHeaders({ 'X-Forwarded-For': '6.6.6.6' }, 'not-an-ip'), {});
});

test('client address uses the socket, and the dev server header only in development without a socket address', () => {
  assert.equal(proxyClientAddress('172.21.0.1', '6.6.6.6', false), '172.21.0.1');
  assert.equal(proxyClientAddress('172.21.0.1', '6.6.6.6', true), '172.21.0.1');
  assert.equal(proxyClientAddress(undefined, '172.21.0.1', false), undefined);
  assert.equal(proxyClientAddress('', '172.21.0.1', false), undefined);
  assert.equal(proxyClientAddress(undefined, '172.21.0.1', true), '172.21.0.1');
  assert.equal(proxyClientAddress(undefined, '6.6.6.6, 172.21.0.1', true), undefined);
  assert.equal(proxyClientAddress(undefined, ['6.6.6.6', '172.21.0.1'], true), undefined);
  assert.equal(proxyClientAddress(undefined, undefined, true), undefined);
});

test('the dev server first hop replaces forwarded headers with the socket address', () => {
  const headers: Record<string, string | string[] | undefined> = {
    'x-forwarded-for': '6.6.6.6', 'x-real-ip': '6.6.6.6', forwarded: 'for=6.6.6.6', 'x-forwarded-proto': 'https', cookie: 'a=b',
  };
  resetForwardedFor(headers, '172.21.0.1');
  assert.deepEqual(headers, { cookie: 'a=b', 'x-forwarded-for': '172.21.0.1' });
  const unknown: Record<string, string | string[] | undefined> = { 'x-forwarded-for': '6.6.6.6' };
  resetForwardedFor(unknown, undefined);
  assert.deepEqual(unknown, {});
});

test('proxy timeout defaults to 30 seconds and rejects invalid settings', () => {
  assert.equal(DEFAULT_API_PROXY_TIMEOUT_MS, 30_000);
  assert.equal(apiProxyTimeoutMs(30_000), 30_000);
  assert.equal(apiProxyTimeoutMs('5000'), 5000);
  for (const value of [0, -1, 1.5, '', 'abc', '10s', undefined, null, Number.NaN, 2 ** 31]) {
    assert.throws(() => apiProxyTimeoutMs(value), /NUXT_API_PROXY_TIMEOUT_MS/, String(value));
  }
});

test('upstream timeout is detected through error causes only for TimeoutError', () => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  assert.equal(isUpstreamTimeout(timeout), true);
  assert.equal(isUpstreamTimeout(Object.assign(new Error('Bad Gateway'), { cause: timeout })), true);
  assert.equal(isUpstreamTimeout(Object.assign(new Error('Bad Gateway'), { cause: new TypeError('fetch failed') })), false);
  assert.equal(isUpstreamTimeout(new DOMException('aborted', 'AbortError')), false);
  assert.equal(isUpstreamTimeout(undefined), false);
});

// 운영: 호스트 nginx → Docker 게이트웨이(예: 172.30.0.1) → 웹. 웹은 게이트웨이 주소 하나만 앞단 프록시로 믿는다.
const GATEWAY = '172.30.0.1';

test('web trust proxy unset keeps the socket-only behavior and drops X-Forwarded-For', () => {
  for (const raw of [undefined, null, '', '   ']) assert.equal(parseWebTrustProxy(raw), undefined, String(raw));
  assert.equal(proxyClientAddress(GATEWAY, '198.51.100.7', false, undefined), GATEWAY);
  assert.equal(proxyClientAddress(GATEWAY, '198.51.100.7', false, parseWebTrustProxy('')), GATEWAY);
  assert.equal(trustedClientAddress(GATEWAY, '198.51.100.7', undefined), GATEWAY);
  assert.deepEqual(apiProxyHeaders({ 'x-forwarded-for': '198.51.100.7' }, proxyClientAddress(GATEWAY, '198.51.100.7', false)), {
    'x-forwarded-for': GATEWAY,
  });
});

test('web trust proxy adopts X-Forwarded-For only from the trusted hop', () => {
  const trust = parseWebTrustProxy(GATEWAY);
  // nginx가 $remote_addr 하나로 덮어쓴 값
  assert.equal(proxyClientAddress(GATEWAY, '198.51.100.7', false, trust), '198.51.100.7');
  // Node가 IPv4 연결을 IPv4-mapped IPv6로 보여줘도 같은 주소로 신뢰한다
  assert.equal(proxyClientAddress(`::ffff:${GATEWAY}`, '198.51.100.7', false, trust), '198.51.100.7');
  assert.equal(proxyClientAddress(GATEWAY, '2001:db8::7', false, trust), '2001:db8::7');
  // 신뢰 hop이 XFF를 붙이지 않았으면 소켓 주소
  assert.equal(proxyClientAddress(GATEWAY, undefined, false, trust), GATEWAY);
  // 다시 쓴 XFF는 고른 주소 하나뿐이다
  assert.deepEqual(apiProxyHeaders({ 'x-forwarded-for': '198.51.100.7', 'x-real-ip': '6.6.6.6', forwarded: 'for=6.6.6.6' },
    proxyClientAddress(GATEWAY, '198.51.100.7', false, trust)), { 'x-forwarded-for': '198.51.100.7' });
});

test('web trust proxy ignores X-Forwarded-For from an untrusted connection', () => {
  const trust = parseWebTrustProxy(GATEWAY);
  assert.equal(proxyClientAddress('172.30.0.9', '198.51.100.7', false, trust), '172.30.0.9');
  assert.equal(proxyClientAddress('203.0.113.5', '127.0.0.1', false, trust), '203.0.113.5');
  assert.equal(proxyClientAddress('::ffff:172.30.0.9', '198.51.100.7', false, trust), '::ffff:172.30.0.9');
});

test('forged multi-hop X-Forwarded-For only yields the first untrusted address from the right', () => {
  const trust = parseWebTrustProxy(GATEWAY);
  // 클라이언트가 위조한 왼쪽 값은 nginx가 덮어쓰지 않았다고 해도 오른쪽 끝(신뢰하지 않는 첫 주소)에서 멈춘다
  assert.equal(proxyClientAddress(GATEWAY, '6.6.6.6, 7.7.7.7, 198.51.100.7', false, trust), '198.51.100.7');
  // 신뢰 주소를 끼워 넣어도 그 주소를 넘어 왼쪽으로 가는 것은 신뢰 목록에 든 hop뿐이다
  assert.equal(proxyClientAddress(GATEWAY, `6.6.6.6, ${GATEWAY}`, false, trust), '6.6.6.6');
  // 신뢰 목록을 대역으로 넓히면 그 대역 주소를 건너뛴다(넓은 신뢰의 위험)
  assert.equal(proxyClientAddress(GATEWAY, '6.6.6.6, 172.30.0.8', false, parseWebTrustProxy('172.30.0.0/24')), '6.6.6.6');
  // IP가 아닌 값은 클라이언트 주소로 쓰지 않고 소켓 주소로 대신한다. 빈 항목은 proxy-addr가 건너뛴다.
  assert.equal(proxyClientAddress(GATEWAY, '198.51.100.7, not-an-ip', false, trust), GATEWAY);
  assert.equal(proxyClientAddress(GATEWAY, '198.51.100.7, 1.2.3.4:5678', false, trust), GATEWAY);
  assert.equal(proxyClientAddress(GATEWAY, '198.51.100.7,,', false, trust), '198.51.100.7');
  assert.equal(proxyClientAddress(GATEWAY, ',', false, trust), GATEWAY);
  // 헤더 줄이 배열로 오면 해석하지 않는다
  assert.equal(proxyClientAddress(GATEWAY, ['6.6.6.6', '198.51.100.7'], false, trust), GATEWAY);
});

test('web trust proxy rejects trust-all and malformed values with the same rules as API TRUST_PROXY', () => {
  const valid = ['172.30.0.1', '172.30.0.0/16', '10.0.0.1, 10.0.0.2', 'loopback', 'linklocal', 'uniquelocal', '::1', 'fd00::/8', '10.0.0.0/32'];
  const invalid = ['true', '*', '2', '0.0.0.0/0', '::/0', '10.0.0.0/33', 'fd00::/129', '10.0.0.1/', '/8', 'example.com', '10.0.0.1,', ',', 'all',
    '10.0.0.0/8/8', '10.0.0.0/0x8'];
  for (const raw of valid) {
    assert.equal(typeof parseWebTrustProxy(raw), 'function', raw);
    assert.ok(parseTrustProxy(raw), `API accepts ${raw}`);
  }
  for (const raw of invalid) {
    assert.throws(() => parseWebTrustProxy(raw), /NUXT_WEB_TRUST_PROXY/, raw);
    assert.throws(() => parseTrustProxy(raw), /TRUST_PROXY/, `API rejects ${raw}`);
  }
  // Nuxt 런타임 설정은 환경 변수를 해석해 true·숫자로 바꿀 수 있다
  for (const raw of [true, false, 2, 0, ['10.0.0.1'], {}]) assert.throws(() => parseWebTrustProxy(raw), /NUXT_WEB_TRUST_PROXY/, String(raw));
  assert.throws(() => webTrustProxy('*'), /NUXT_WEB_TRUST_PROXY/);
  assert.equal(webTrustProxy(''), undefined);
  assert.equal(typeof webTrustProxy(GATEWAY), 'function');
  assert.equal(webTrustProxy(GATEWAY), webTrustProxy(GATEWAY));
});

test('the dev server first hop keeps its behavior and follows the web trust proxy when set', () => {
  // 미설정: 위조 헤더를 버리고 소켓 주소
  const plain: Record<string, string | string[] | undefined> = { 'X-Forwarded-For': '6.6.6.6', 'x-real-ip': '6.6.6.6' };
  resetForwardedFor(plain, '172.21.0.1');
  assert.deepEqual(plain, { 'x-forwarded-for': '172.21.0.1' });
  // 설정: 신뢰 hop에서 온 XFF의 클라이언트 주소 하나로 다시 쓰고, 워커(소켓 없음)는 그 값을 쓴다
  const trust = parseWebTrustProxy(GATEWAY);
  const trusted: Record<string, string | string[] | undefined> = { 'x-forwarded-for': '6.6.6.6, 198.51.100.7', forwarded: 'for=6.6.6.6' };
  resetForwardedFor(trusted, GATEWAY, trust);
  assert.deepEqual(trusted, { 'x-forwarded-for': '198.51.100.7' });
  assert.equal(proxyClientAddress(undefined, trusted['x-forwarded-for'], true, trust), '198.51.100.7');
  // 설정해도 신뢰하지 않는 연결의 XFF는 버린다
  const untrusted: Record<string, string | string[] | undefined> = { 'x-forwarded-for': '6.6.6.6' };
  resetForwardedFor(untrusted, '172.30.0.9', trust);
  assert.deepEqual(untrusted, { 'x-forwarded-for': '172.30.0.9' });
  // 운영 빌드의 SSR 내부 호출(소켓 주소 없음)은 trust와 관계없이 주소를 붙이지 않는다
  assert.equal(proxyClientAddress(undefined, '198.51.100.7', false, trust), undefined);
});
