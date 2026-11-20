import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const markdown = new MarkdownIt({ html: false, linkify: true });

/** 본문 이미지로 허용하는 유일한 주소: 같은 출처의 업로드 이미지 `/api/v1/images/<uuid>`. */
const INTERNAL_IMAGE = /^\/api\/v1\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isInternalImageUrl(value: unknown): boolean {
  return typeof value === 'string' && INTERNAL_IMAGE.test(value);
}

export function renderMarkdown(value: string): string {
  return sanitizeHtml(markdown.render(value), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'pre', 'code'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title', 'loading', 'decoding'], code: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    // 이미지는 스킴이 있는 주소(http/https/data 등)를 모두 거부하고, 아래 필터가 내부 경로만 남긴다.
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    transformTags: {
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy', decoding: 'async' } }),
    },
    // 외부 이미지·잘못된 주소의 img는 alt를 포함해 통째로 제거한다.
    exclusiveFilter: (frame) => frame.tag === 'img' && !isInternalImageUrl(frame.attribs.src),
  });
}

/**
 * 메타 description용 일반 텍스트. 렌더링한 HTML을 다시 벗기지 않고 Markdown 토큰의 글자만 모은다
 * (엔티티는 디코드된 글자, 코드 블록·이미지 주소는 제외). 본문에 글자로 적힌 HTML 태그 모양(`<b>` 등)도 지운다.
 * 결과는 텍스트로만 써야 하며 HTML로 넣지 않는다(head 속성 이스케이프는 unhead가 한다).
 */
export function markdownPlainText(value: string): string {
  const parts: string[] = [];
  for (const token of markdown.parse(value, {})) {
    if (token.type !== 'inline' || !token.children) continue;
    for (const child of token.children) {
      if (child.type === 'text' || child.type === 'text_special' || child.type === 'code_inline') parts.push(child.content);
      else if (child.type === 'softbreak' || child.type === 'hardbreak') parts.push(' ');
    }
    parts.push(' ');
  }
  return parts.join('').replace(/<\/?[a-z][^<>]*>/gi, ' ').replace(/\s+/g, ' ').trim();
}
