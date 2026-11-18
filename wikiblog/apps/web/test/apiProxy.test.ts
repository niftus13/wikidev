import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiProxyHeaders,
  apiProxyTimeoutMs,
  DEFAULT_API_PROXY_TIMEOUT_MS,
  isUpstreamTimeout,
  proxyClientAddress,
  resetForwardedFor,
} from '../server/utils/apiProxy.ts';

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
