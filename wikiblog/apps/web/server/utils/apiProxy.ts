import { isIP } from 'node:net';

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
 * 프록시가 직접 확인한 클라이언트 주소가 있을 때만 X-Forwarded-For를 그 주소 하나로 새로 쓴다.
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

/**
 * 프록시가 믿을 수 있는 클라이언트 주소를 정한다.
 * - 운영(nuxt build): 서버 소켓의 원격 주소. SSR 내부 호출(localFetch)은 소켓 주소가 없으므로 주소를 붙이지 않는다.
 * - 개발(nuxt dev): Nitro 워커는 개발 서버와 유닉스 소켓으로 연결되어 소켓 주소가 없다. 개발 서버 앞단 핸들러
 *   (`resetForwardedFor`)가 클라이언트 헤더를 지우고 자신이 본 소켓 주소 하나로 X-Forwarded-For를 쓰므로 그 값을 쓴다.
 */
export function proxyClientAddress(socketAddress: string | undefined, forwardedFor: unknown, dev: boolean): string | undefined {
  const direct = validClientAddress(socketAddress);
  if (direct) return direct;
  if (!dev) return undefined;
  return validClientAddress(Array.isArray(forwardedFor) ? undefined : forwardedFor);
}

/** 개발 서버 첫 hop에서 실행한다. 위조 가능한 전달 헤더를 지우고 실제 연결 주소로 X-Forwarded-For를 만든다. */
export function resetForwardedFor(headers: IncomingHeaders, socketAddress: string | undefined): void {
  for (const name of Object.keys(headers)) {
    if (isForwardingHeader(name.toLowerCase())) delete headers[name];
  }
  const address = validClientAddress(socketAddress);
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
