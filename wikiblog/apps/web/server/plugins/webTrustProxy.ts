import { webTrustProxy } from '../utils/apiProxy';

// 서버 시작 시 NUXT_WEB_TRUST_PROXY를 검사한다. 잘못된 값이나 모든 주소를 믿는 값이면 첫 요청이 아니라 시작에서 실패한다.
export default defineNitroPlugin(() => {
  webTrustProxy(useRuntimeConfig().webTrustProxy);
});
