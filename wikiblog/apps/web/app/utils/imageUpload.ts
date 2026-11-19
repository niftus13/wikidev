import type { ImageContentType } from '@wikiblog/dto';

/** 서버(`POST /api/v1/me/images`)가 받는 형식. 최종 판정은 서버의 파일 시그니처 검사다. */
export const IMAGE_CONTENT_TYPES: readonly ImageContentType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
/** 숨긴 file input의 `accept` 값 */
export const IMAGE_ACCEPT = IMAGE_CONTENT_TYPES.join(',');
/** 업로드 1장의 상한(2 MiB). 서버는 넘으면 413이다. */
export const MAX_IMAGE_BYTES = 2_097_152;
/** 본문 초안의 UTF-8 바이트 상한(저장 API와 같다). */
export const MAX_BODY_BYTES = 12_000;
const MAX_ALT_LENGTH = 100;
const DEFAULT_ALT = '이미지';
const PLACEHOLDER_SCHEME = 'uploading:';
/** 서버 응답 id(소문자 UUID) 길이. 최종 Markdown 길이를 미리 계산할 때 쓴다. */
const IMAGE_URL_LENGTH = '/api/v1/images/'.length + 36;

export type ImageCheckError = 'type' | 'size' | 'empty';

export function isAllowedImageType(type: string): type is ImageContentType {
  return (IMAGE_CONTENT_TYPES as readonly string[]).includes(type);
}

/** 브라우저에서 먼저 하는 검사. 통과하지 못한 파일은 업로드하지 않는다. */
export function checkImageFile(file: { type: string; size: number }): ImageCheckError | null {
  if (!isAllowedImageType(file.type)) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > MAX_IMAGE_BYTES) return 'size';
  return null;
}

/**
 * 파일 이름으로 alt를 만든다. 확장자를 빼고, Markdown 이미지 문법을 깨는 문자(`[`, `]`, `\`)와 줄바꿈·제어 문자를
 * 공백으로 바꾼 뒤 공백을 하나로 합친다. 결과가 비면 "이미지"를 쓴다.
 */
export function altFromFileName(name: string | undefined | null): string {
  const base = (name ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[[\]\\\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, MAX_ALT_LENGTH).join('').trim() || DEFAULT_ALT;
}

export function imageMarkdown(alt: string, url: string): string {
  return `![${alt}](${url})`;
}

export function placeholderMarkdown(alt: string, tempId: string): string {
  return `![업로드 중: ${alt}](${PLACEHOLDER_SCHEME}${tempId})`;
}

/** 업로드가 끝난 뒤 본문에 들어갈 Markdown의 최대 바이트 수(서버 URL은 고정 길이). */
export function finalImageBytes(alt: string): number {
  return utf8Bytes(`![${alt}]()`) + IMAGE_URL_LENGTH + 4; // 앞뒤 빈 줄(최대 4바이트) 포함
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** 여러 이미지를 넣을 때 사이에 두는 구분(빈 줄). 각 이미지가 따로 문단이 된다. */
export const IMAGE_BLOCK_SEPARATOR = '\n\n';

/**
 * 커서(선택 영역)를 `text`로 바꾼다. 이미지가 앞뒤 글과 같은 문단으로 붙지 않도록 필요한 만큼만 빈 줄을 넣는다.
 * 반환하는 `cursor`는 넣은 글자 바로 뒤 위치다.
 */
export function insertBlock(body: string, start: number, end: number, text: string): { body: string; cursor: number } {
  const from = clamp(Math.min(start, end), 0, body.length);
  const to = clamp(Math.max(start, end), from, body.length);
  const before = body.slice(0, from);
  const after = body.slice(to);
  const prefix = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const inserted = `${prefix}${text}${suffix}`;
  return { body: before + inserted + after, cursor: before.length + prefix.length + text.length };
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : max;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function placeholderPattern(tempId: string) {
  // 사용자가 alt 부분을 고쳤어도 고유 주소 `(uploading:<id>)`가 남아 있으면 같은 자리로 본다.
  return new RegExp(`!\\[[^\\]\\n]*\\]\\(${escapeRegExp(PLACEHOLDER_SCHEME + tempId)}\\)`);
}

/** 임시 자리가 아직 본문에 있는지 */
export function hasPlaceholder(body: string, tempId: string): boolean {
  return placeholderPattern(tempId).test(body);
}

/** 임시 자리를 최종 Markdown으로 바꾼다. 사용자가 임시 자리를 지웠으면 `null`(결과를 넣지 않는다). */
export function replacePlaceholder(body: string, tempId: string, markdown: string): string | null {
  const pattern = placeholderPattern(tempId);
  if (!pattern.test(body)) return null;
  return body.replace(pattern, () => markdown);
}

/** 임시 자리를 지운다. 임시 자리만 있던 줄은 줄째로 지운다. 없으면 본문을 그대로 돌려준다. */
export function removePlaceholder(body: string, tempId: string): string {
  const match = placeholderPattern(tempId).exec(body);
  if (!match) return body;
  const start = match.index;
  const end = start + match[0].length;
  const lineStart = start === 0 || body[start - 1] === '\n';
  if (lineStart && body[end] === '\n') return body.slice(0, start) + body.slice(end + 1);
  if (lineStart && end === body.length && start > 0) return body.slice(0, start - 1);
  return body.slice(0, start) + body.slice(end);
}

let sequence = 0;
/** 화면 안에서 고유한 임시 id. 보안 값이 아니며 본문 자리 표시에만 쓴다. */
export function createTempId(now = Date.now(), random = Math.random()): string {
  sequence += 1;
  return `${now.toString(36)}-${sequence.toString(36)}-${Math.floor(random * 1e8).toString(36)}`;
}

/** 사전 검사 실패 문구 */
export function checkErrorMessage(error: ImageCheckError): string {
  if (error === 'type') return 'PNG·JPEG·WebP·GIF 이미지만 올릴 수 있습니다.';
  if (error === 'size') return '이미지는 2MB 이하만 올릴 수 있습니다.';
  return '빈 파일은 올릴 수 없습니다.';
}

/** 업로드 응답 상태 코드별 문구. 401·403은 화면이 "새 탭에서 로그인" 링크를 함께 보여준다. */
export function uploadErrorMessage(status: number | undefined): string {
  if (status === 400 || status === 415) return 'PNG·JPEG·WebP·GIF 이미지만 올릴 수 있습니다. 파일 내용이 형식과 맞는지 확인해 주세요.';
  if (status === 413) return '이미지는 2MB 이하만 올릴 수 있습니다.';
  if (status === 409) return '이미지 저장 공간(50MB)을 모두 사용해 더 올릴 수 없습니다.';
  if (status === 401 || status === 403) return '세션이 만료되었거나 인증 정보가 변경되었습니다. 입력은 그대로 있으니 새 탭에서 로그인한 뒤 다시 올려 주세요.';
  return '이미지를 올리지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function isAuthFailure(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

/** 붙여넣기·끌어다 놓기 데이터에서 파일 항목만 꺼낸다. 글자만 있으면 빈 배열이다. */
export function filesFromDataTransfer(data: Pick<DataTransfer, 'items' | 'files'> | null | undefined): File[] {
  if (!data) return [];
  const files: File[] = [];
  if (data.items && data.items.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    return files;
  }
  return Array.from(data.files ?? []);
}

/** 끌어다 놓는 항목에 파일이 있는지(dragover 단계에서는 내용을 읽을 수 없어 종류만 본다). */
export function dragHasFiles(data: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  return !!data && Array.from(data.types ?? []).includes('Files');
}
