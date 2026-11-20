/** 공간 소개 최대 길이. 서버(`PATCH /spaces/{handle}`)와 같은 `Array.from` 기준이다. */
export const SPACE_DESCRIPTION_LIMIT = 500;

export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** 메타 설명용 요약: 공백을 한 칸으로 줄이고 코드 포인트 기준으로 자른다. */
export function descriptionExcerpt(text: string, max = 160): string {
  const characters = Array.from(text.replace(/\s+/g, ' ').trim());
  return characters.length > max ? `${characters.slice(0, max - 1).join('')}…` : characters.join('');
}
