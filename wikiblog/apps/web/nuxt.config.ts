import type { IncomingMessage } from 'node:http';
import { DEFAULT_API_PROXY_TIMEOUT_MS, resetForwardedFor } from './server/utils/apiProxy';

// nuxt dev 전용: 개발 서버(첫 hop)가 Nitro 워커로 요청을 넘기기 전에 위조 가능한 전달 헤더를 지우고
// 실제 연결 주소로 X-Forwarded-For를 쓴다. 워커는 유닉스 소켓으로 연결되어 직접 주소를 알 수 없다.
const resetForwardedForHandler = Object.assign(
  (event: { node: { req: IncomingMessage } }) => {
    resetForwardedFor(event.node.req.headers, event.node.req.socket?.remoteAddress);
  },
  { __is_handler__: true as const },
);

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devServer: { host: '0.0.0.0' },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    apiProxyTarget: process.env.API_PROXY_TARGET || 'http://localhost:4000',
    // NUXT_API_PROXY_TIMEOUT_MS로 바꿀 수 있다. 넘으면 /api 프록시가 504를 반환한다.
    apiProxyTimeoutMs: DEFAULT_API_PROXY_TIMEOUT_MS,
  },
  // /api는 개발·운영 모두 server/api/[...path].ts가 처리한다(nitro.devProxy를 쓰지 않는다).
  devServerHandlers: [{ route: '/', handler: resetForwardedForHandler as never }],
});
