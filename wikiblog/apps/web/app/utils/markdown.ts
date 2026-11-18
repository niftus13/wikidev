import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const markdown = new MarkdownIt({ html: false, linkify: true });

export function renderMarkdown(value: string): string {
  return sanitizeHtml(markdown.render(value), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'pre', 'code'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'], code: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
  });
}
