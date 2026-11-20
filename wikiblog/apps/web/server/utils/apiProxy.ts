import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import proxyAddr from 'proxy-addr';

// 순수 함수만 둔다. nuxt.config.ts(개발 서버)와 단위 테스트도 이 파일을 직접 가져온다.

type IncomingHeaders = Record<string, string | string[] | undefined>;

export const DEFAULT_API_PROXY_TIMEOUT_MS = 30_000;

// h3 proxyRequest가 전달하지 않는 hop-by-hop·호스트 헤더와 같다.
const HOP_HEADERS = new Set(['transfer-encoding', 'accept-encoding', 'connection', 'keep-alive', 'upgrade', 'expect', 'host', 'accept']);
// 클라이언트가 보낸 주소·전달 정보는 위조될 수 있으므로 버린다.
const FORWARDING_HEADERS = new Set(['x-real-ip', 'forwarded']);

function isForwardingHeader(name: string): boolean {
  return FORWARDING_HEADERS.has(name) || name.startsWith('x-forwarded-');
}

export function validClientAddress(value: unknown): string | undefined {
  return typeof value === 'string' && isIP(value) !== 0 ? value : undefined;
}

/**
 * API로 보낼 요청 헤더를 만든다. 클라이언트의 X-Forwarded-*·X-Real-IP·Forwarded를 버리고,
 * 프록시가 정한 클라이언트 주소(`proxyClientAddress`)가 있을 때만 X-Forwarded-For를 그 주소 하나로 새로 쓴다.
 */
export function apiProxyHeaders(incoming: IncomingHeaders, clientAddress: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(incoming)) {
    const name = rawName.toLowerCase();
    if (value === undefined || HOP_HEADERS.has(name) || isForwardingHeader(name)) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  const address = validClientAddress(clientAddress);
  if (address) headers['x-forwarded-for'] = address;
  return headers;
}

/** 웹 앞단(nginx 등)에서 X-Forwarded-For를 믿을 직전 hop인지 판단하는 함수. `proxy-addr`의 trust 함수와 같다. */
export type TrustProxy = (address: string, hop: number) => boolean;

const TRUST_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);
const WEB_TRUST_PROXY_ERROR =
  'NUXT_WEB_TRUST_PROXY (WEB_TRUST_PROXY) must be a comma-separated list of IP addresses, CIDR ranges, loopback, linklocal or uniquelocal';

// API의 TRUST_PROXY(apps/api/src/config.ts parseTrustProxy)와 같은 허용 규칙이다. 단위 테스트가 두 규칙이 같은지 확인한다.
function validTrustProxyEntry(entry: string): boolean {
  if (TRUST_PROXY_NAMES.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || !address) return false;
  const version = isIP(address);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  if (!/^[0-9]{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  return bits >= 1 && bits <= (version === 4 ? 32 : 128);
}

/**
 * 웹 `WEB_TRUST_PROXY`(런타임 `NUXT_WEB_TRUST_PROXY`) 값을 검사해 trust 함수로 만든다.
 * 비어 있으면 undefined(앞단 프록시를 믿지 않음 — 소켓 주소만 쓴다). 모든 주소를 믿는 값(true, hop 수, *, /0)이나
 * 형식이 잘못된 값은 오류다. Nuxt 런타임 설정은 환경 변수 값을 JSON처럼 해석하므로(`true`→boolean, `2`→number)
 * 문자열이 아닌 값도 오류로 막는다.
 */
export function parseWebTrustProxy(raw: unknown): TrustProxy | undefined {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return undefined;
  if (typeof raw !== 'string') throw new Error(WEB_TRUST_PROXY_ERROR);
  const entries = raw.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    if (!validTrustProxyEntry(entry)) throw new Error(WEB_TRUST_PROXY_ERROR);
  }
  return proxyAddr.compile(entries);
}

let cachedTrust: { raw: unknown; trust: TrustProxy | undefined } | undefined;

/** 런타임 설정 값으로 trust 함수를 만든다. 같은 값이면 다시 컴파일하지 않는다. */
export function webTrustProxy(raw: unknown): TrustProxy | undefined {
  if (!cachedTrust || cachedTrust.raw !== raw) cachedTrust = { raw, trust: parseWebTrustProxy(raw) };
  return cachedTrust.trust;
}

/**
 * 소켓 주소와 X-Forwarded-For로 클라이언트 주소를 정한다(Express `trust proxy`와 같은 `proxy-addr` 규칙).
 * - trust가 없거나 소켓 주소가 신뢰 목록 밖이면 소켓 주소. 이때 클라이언트가 보낸 XFF는 버린다.
 * - 소켓 주소가 신뢰 목록이면 XFF를 오른쪽부터 보며 신뢰하지 않는 첫 주소를 클라이언트로 정한다.
 *   그 값이 IP 형식이 아니면(신뢰 hop이 잘못된 값을 넘김) 소켓 주소를 쓴다.
 * - XFF가 여러 헤더 줄 배열로 오면(Node는 보통 쉼표로 합친다) 해석하지 않고 소켓 주소를 쓴다.
 */
export function trustedClientAddress(socketAddress: string | undefined, forwardedFor: unknown, trust: TrustProxy | undefined): string | undefined {
  const direct = validClientAddress(socketAddress);
  if (!direct || !trust || typeof forwardedFor !== 'string') return direct;
  const request = { socket: { remoteAddress: direct }, headers: { 'x-forwarded-for': forwardedFor } } as unknown as IncomingMessage;
  return validClientAddress(proxyAddr(request, trust)) ?? direct;
}

/**
 * 프록시가 믿을 수 있는 클라이언트 주소를 정한다.
 * - 운영(nuxt build): 서버 소켓의 원격 주소. `WEB_TRUST_PROXY`가 있고 소켓 주소가 그 목록이면 XFF에서 클라이언트 주소를 고른다
 *   (`trustedClientAddress`). SSR 내부 호출(localFetch)은 소켓 주소가 없으므로 주소를 붙이지 않는다.
 * - 개발(nuxt dev): Nitro 워커는 개발 서버와 유닉스 소켓으로 연결되어 소켓 주소가 없다. 개발 서버 앞단 핸들러
 *   (`resetForwardedFor`)가 클라이언트 헤더를 지우고 자신이 정한 주소 하나로 X-Forwarded-For를 쓰므로 그 값을 쓴다.
 */
export function proxyClientAddress(
  socketAddress: string | undefined,
  forwardedFor: unknown,
  dev: boolean,
  trust?: TrustProxy,
): string | undefined {
  if (validClientAddress(socketAddress)) return trustedClientAddress(socketAddress, forwardedFor, trust);
  if (!dev) return undefined;
  return validClientAddress(Array.isArray(forwardedFor) ? undefined : forwardedFor);
}

/**
 * 개발 서버 첫 hop에서 실행한다. 위조 가능한 전달 헤더를 지우고 실제 연결 주소로 X-Forwarded-For를 만든다.
 * trust가 있으면(개발 서버 앞에 프록시를 둔 경우) 운영과 같은 규칙으로 고른 주소를 쓴다.
 */
export function resetForwardedFor(headers: IncomingHeaders, socketAddress: string | undefined, trust?: TrustProxy): void {
  const forwardedFor = Object.entries(headers).find(([name]) => name.toLowerCase() === 'x-forwarded-for')?.[1];
  const address = trustedClientAddress(socketAddress, forwardedFor, trust);
  for (const name of Object.keys(headers)) {
    if (isForwardingHeader(name.toLowerCase())) delete headers[name];
  }
  if (address) headers['x-forwarded-for'] = address;
}

export function apiProxyTimeoutMs(value: unknown): number {
  const parsed = typeof value === 'string' && /^[0-9]+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new Error('NUXT_API_PROXY_TIMEOUT_MS must be a positive integer number of milliseconds');
  }
  return parsed;
}

export function isUpstreamTimeout(error: unknown): boolean {
  for (let current = error, depth = 0; current && typeof current === 'object' && depth < 5; depth += 1) {
    if ('name' in current && current.name === 'TimeoutError') return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
