/** 검색 API(`GET /api/v1/search`)가 반환하는 최대 결과 수. */
export const SEARCH_RESULT_LIMIT = 50;

/** 입력 중 자동 검색 대기 시간(ms). */
export const SEARCH_DEBOUNCE_MS = 300;

export interface SearchCriteria {
  q?: unknown;
  categoryId?: unknown;
  tag?: unknown;
}

export type SearchQuery = Partial<Record<'q' | 'categoryId' | 'tag', string>>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** URL 쿼리·입력값을 검색 쿼리로 정규화한다. 앞뒤 공백을 지우고 빈 값과 문자열이 아닌 값은 뺀다. */
export function normalizeSearchQuery(criteria: SearchCriteria): SearchQuery {
  const query: SearchQuery = {};
  const q = text(criteria.q);
  const categoryId = text(criteria.categoryId);
  const tag = text(criteria.tag);
  if (q) query.q = q;
  if (categoryId) query.categoryId = categoryId;
  if (tag) query.tag = tag;
  return query;
}

/** 두 검색 쿼리가 같은 검색인지 비교한다(같으면 URL을 다시 바꾸지 않는다). */
export function sameSearchQuery(a: SearchQuery, b: SearchQuery): boolean {
  return a.q === b.q && a.categoryId === b.categoryId && a.tag === b.tag;
}

/** 아바타에 표시할 handle의 첫 글자. 코드 포인트 기준이며 영문은 대문자로 보인다. */
export function avatarInitial(handle: string): string {
  const first = Array.from(handle.trim())[0];
  return first ? first.toUpperCase() : '?';
}
