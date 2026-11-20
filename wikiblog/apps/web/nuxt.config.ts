import type { IncomingMessage } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import { DEFAULT_API_PROXY_TIMEOUT_MS, parseWebTrustProxy, resetForwardedFor } from './server/utils/apiProxy';
import { SITE_DESCRIPTION, SITE_TITLE } from './app/utils/meta';

// 웹 앞단 프록시(운영의 호스트 nginx) 주소. 비어 있으면 앞단을 믿지 않고 소켓 주소만 쓴다. 잘못된 값이면 시작 시 오류다.
// 운영 빌드는 런타임 환경 변수 NUXT_WEB_TRUST_PROXY로 정한다(server/plugins/webTrustProxy.ts가 시작 시 검사).
const webTrustProxyValue = process.env.NUXT_WEB_TRUST_PROXY ?? process.env.WEB_TRUST_PROXY ?? '';
const devTrustProxy = parseWebTrustProxy(webTrustProxyValue);

// nuxt dev 전용: 개발 서버(첫 hop)가 Nitro 워커로 요청을 넘기기 전에 위조 가능한 전달 헤더를 지우고
// 실제 연결 주소(앞단 프록시를 믿도록 설정했으면 그 규칙으로 고른 주소)로 X-Forwarded-For를 쓴다.
// 워커는 유닉스 소켓으로 연결되어 직접 주소를 알 수 없다.
const resetForwardedForHandler = Object.assign(
  (event: { node: { req: IncomingMessage } }) => {
    resetForwardedFor(event.node.req.headers, event.node.req.socket?.remoteAddress, devTrustProxy);
  },
  { __is_handler__: true as const },
);

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devServer: { host: '0.0.0.0' },
  // 사이트 공통 <head>. 화면별 title·description·og는 usePageMeta(app/composables)가, 제목 규칙(titleTemplate)은 app.vue가 정한다.
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      title: SITE_TITLE,
      meta: [
        { name: 'description', content: SITE_DESCRIPTION },
        // 헤더 브랜드 마크와 같은 색(.brand-mark).
        { name: 'theme-color', content: '#2663ce' },
      ],
      // 파비콘 원본은 public/favicon.svg, 나머지는 scripts/generate-icons.mjs로 만든다(README "웹 화면 스타일").
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  // CSS는 HTML 안 <style>이 아니라 외부 /_nuxt/*.css <link rel="stylesheet">로 넣는다(운영 빌드 기준, nuxt dev는 Vite가 JS로 주입).
  // 첫 화면에 CSS 요청이 하나 늘지만 브라우저·/_nuxt 캐시를 쓰고, CSP의 style-src에서 'unsafe-inline'을 뺄 수 있다.
  features: { inlineStyles: false },
  // 엔트리 청크를 인라인 <script type="importmap">으로 찾지 않는다(남는 인라인 스크립트를 줄인다).
  // 대신 엔트리가 바뀌면 그것을 import하는 청크의 해시도 바뀌어 캐시 재사용이 조금 줄어든다.
  experimental: { entryImportMap: false },
  // 운영 빌드 서버에서 @lucide/vue를 외부 CJS로 두면 별도 vue 인스턴스를 불러 SSR이 500(useLucideProps undefined)으로 실패한다.
  // 번들에 포함해 앱과 같은 vue를 쓰게 한다.
  build: { transpile: ['@lucide/vue'] },
  // Tailwind v4는 theme·utilities 레이어만 쓴다(preflight 없음). 설정은 main.css의 @import·@theme에 있다.
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    apiProxyTarget: process.env.API_PROXY_TARGET || 'http://localhost:4000',
    // NUXT_API_PROXY_TIMEOUT_MS로 바꿀 수 있다. 넘으면 /api 프록시가 504를 반환한다.
    apiProxyTimeoutMs: DEFAULT_API_PROXY_TIMEOUT_MS,
    // NUXT_WEB_TRUST_PROXY로 바꿀 수 있다. API TRUST_PROXY와 같은 형식(IP·CIDR·loopback·linklocal·uniquelocal, trust-all 거부).
    webTrustProxy: webTrustProxyValue,
  },
  // /api는 개발·운영 모두 server/api/[...path].ts가 처리한다(nitro.devProxy를 쓰지 않는다).
  devServerHandlers: [{ route: '/', handler: resetForwardedForHandler as never }],
});
