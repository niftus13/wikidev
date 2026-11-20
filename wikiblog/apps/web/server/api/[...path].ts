import { apiProxyHeaders, apiProxyTimeoutMs, isUpstreamTimeout, proxyClientAddress, webTrustProxy } from '../utils/apiProxy';

const PAYLOAD_METHODS = new Set(['PATCH', 'POST', 'PUT', 'DELETE']);

// 개발(nuxt dev)과 운영이 같은 코드로 /api를 API 서버에 전달한다.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const timeoutMs = apiProxyTimeoutMs(config.apiProxyTimeoutMs);
  const url = getRequestURL(event);
  const request = event.node.req;
  // 운영에서 웹 앞에 nginx가 있으면 NUXT_WEB_TRUST_PROXY(그 hop의 주소)에서 온 연결만 X-Forwarded-For를 이어받는다.
  const trust = webTrustProxy(config.webTrustProxy);
  const clientAddress = proxyClientAddress(request.socket?.remoteAddress, request.headers['x-forwarded-for'], import.meta.dev, trust);
  const headers = apiProxyHeaders(request.headers, clientAddress);
  const raw = PAYLOAD_METHODS.has(event.method) ? await readRawBody(event, false) : undefined;
  const body = raw ? new Uint8Array(raw) : undefined;
  try {
    return await sendProxy(event, `${config.apiProxyTarget}${url.pathname}${url.search}`, {
      fetchOptions: { method: event.method, headers, body, signal: AbortSignal.timeout(timeoutMs) },
    });
  } catch (error) {
    if (isUpstreamTimeout(error) && !event.node.res.headersSent) {
      // 응답 헤더를 받은 뒤 본문에서 시간이 초과되면 이미 복사한 API 헤더(Set-Cookie 등)를 504에 남기지 않는다.
      for (const name of event.node.res.getHeaderNames()) event.node.res.removeHeader(name);
      setResponseStatus(event, 504);
      setResponseHeader(event, 'cache-control', 'no-store');
      return { error: 'Upstream timeout' };
    }
    throw error;
  }
});
