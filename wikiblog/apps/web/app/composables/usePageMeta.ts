import type { MaybeRefOrGetter } from 'vue';
import { formatTitle, metaDescription, SITE_NAME } from '~/utils/meta';

export interface PageMetaInput {
  /** 화면 제목. 사이트 이름은 app.vue의 titleTemplate이 붙이므로 넣지 않는다. 없으면 사이트 기본 제목. */
  title?: MaybeRefOrGetter<string | null | undefined>;
  /** 일반 텍스트 설명(HTML 금지). 공백 정리·길이 제한 후 비면 사이트 기본 설명을 쓴다. */
  description?: MaybeRefOrGetter<string | null | undefined>;
  /** true면 검색 엔진 색인 제외(robots: noindex). 관리 화면·인증 화면·오류 상태에 쓴다. */
  noindex?: MaybeRefOrGetter<boolean | undefined>;
  /** og:type. 기본 website, 공개 문서 페이지는 article. */
  type?: 'website' | 'article';
}

/**
 * 화면별 title·description을 `<head>`에 주입하는 공통 진입점. 모든 페이지는 useSeoMeta 대신 이것을 쓴다.
 * SSR 응답 HTML에 들어가며, 반응형 값(getter)을 넘기면 데이터가 바뀔 때 브라우저에서도 갱신된다.
 */
export function usePageMeta(input: PageMetaInput = {}) {
  const title = () => toValue(input.title)?.trim() || '';
  const description = () => metaDescription(toValue(input.description));
  useSeoMeta({
    // 빈 문자열이면 titleTemplate이 사이트 기본 제목을 만든다.
    title,
    description,
    ogTitle: () => formatTitle(title()),
    ogDescription: description,
    ogType: input.type ?? 'website',
    ogSiteName: SITE_NAME,
    twitterCard: 'summary',
    robots: () => (toValue(input.noindex) ? 'noindex' : undefined),
  });
}
