import { descriptionExcerpt } from './space.ts';

/** 페이지 `<head>` 메타의 순수 규칙. 주입은 `usePageMeta`, 사이트 공통 값은 nuxt.config `app.head`가 맡는다. */
export const SITE_NAME = 'WikiBlog';
/** 제목이 없는 화면(홈)의 전체 제목. */
export const SITE_TITLE = 'WikiBlog — 책으로 만나는 지식';
/** description이 없거나 비었을 때 쓰는 사이트 기본 설명. nuxt.config의 기본 description과 같다. */
export const SITE_DESCRIPTION = '책과 계층형 문서로 지식을 쌓고 공개하는 위키형 블로그, WikiBlog의 공개된 책과 문서를 읽어보세요.';
/** 검색 결과 요약에 보이는 길이를 고려한 description 최대 길이(코드 포인트). */
export const META_DESCRIPTION_LIMIT = 160;

const TITLE_SEPARATOR = ' — ';

/** titleTemplate 규칙: 화면 제목 뒤에 사이트 이름을 붙이고, 제목이 없으면 사이트 기본 제목을 쓴다. */
export function formatTitle(title?: string | null): string {
  const value = title?.replace(/\s+/g, ' ').trim();
  return value ? `${value}${TITLE_SEPARATOR}${SITE_NAME}` : SITE_TITLE;
}

/** 여러 조각(예: 페이지 제목, 책 제목)을 한 화면 제목으로 잇는다. 빈 조각은 건너뛴다. */
export function joinTitle(...parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
}

/** 공백을 정리하고 길이를 제한한 description. 비면 다음 후보, 모두 비면 사이트 기본 설명. */
export function metaDescription(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = candidate ? descriptionExcerpt(candidate, META_DESCRIPTION_LIMIT) : '';
    if (value) return value;
  }
  return SITE_DESCRIPTION;
}
