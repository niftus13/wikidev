import type { ImageUploadResponse } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';
import {
  altFromFileName,
  checkErrorMessage,
  checkImageFile,
  createTempId,
  finalImageBytes,
  IMAGE_BLOCK_SEPARATOR,
  imageMarkdown,
  insertBlock,
  isAuthFailure,
  MAX_BODY_BYTES,
  placeholderMarkdown,
  removePlaceholder,
  replacePlaceholder,
  uploadErrorMessage,
  utf8Bytes,
} from '~/utils/imageUpload';
import { isInternalImageUrl } from '~/utils/markdown';

interface Options {
  /** 현재 본문(편집 중인 값) */
  getBody: () => string;
  /** 본문을 바꾼다. 결과는 기존 dirty·이탈 확인 규칙을 그대로 따른다. */
  setBody: (value: string) => void;
  csrfToken: () => string | undefined;
}

interface QueueItem {
  file: File;
  alt: string;
  tempId: string;
}

/**
 * 편집 화면의 이미지 넣기. 파일을 미리 검사하고, 커서 위치에 임시 자리를 넣은 뒤 한 장씩 순서대로 올려 결과로 바꾼다.
 * 업로드 중에도 본문은 계속 고칠 수 있으며, 사용자가 임시 자리를 지웠으면 결과를 넣지 않는다.
 */
export function useImageUpload(options: Options) {
  const queue: QueueItem[] = [];
  const uploading = ref(false);
  const done = ref(0);
  const total = ref(0);
  const errors = ref<string[]>([]);
  const needsLogin = ref(false);
  const lastNotice = ref('');
  const statusText = computed(() => uploading.value ? `이미지 ${Math.min(done.value + 1, total.value)}/${total.value} 업로드 중` : lastNotice.value);

  /** 파일을 검사하고 통과한 파일의 임시 자리를 넣는다. 넣은 글자 뒤 커서 위치를 반환한다(넣지 않았으면 null). */
  function add(files: File[], selectionStart: number, selectionEnd: number): number | null {
    if (!files.length) return null;
    if (!uploading.value) {
      errors.value = [];
      needsLogin.value = false;
    }
    lastNotice.value = '';
    const accepted: QueueItem[] = [];
    for (const file of files) {
      const alt = altFromFileName(file.name);
      const problem = checkImageFile(file);
      if (problem) errors.value.push(`${file.name || alt}: ${checkErrorMessage(problem)}`);
      else accepted.push({ file, alt, tempId: createTempId() });
    }
    if (!accepted.length) return null;
    // 업로드가 끝난 뒤 본문 12,000바이트를 넘으면 저장할 수 없으므로 올리기 전에 막는다(고아 이미지 방지).
    const pendingBytes = queue.reduce((sum, item) => sum + finalImageBytes(item.alt), 0);
    const addedBytes = accepted.reduce((sum, item) => sum + finalImageBytes(item.alt), 0);
    if (utf8Bytes(options.getBody()) + pendingBytes + addedBytes > MAX_BODY_BYTES) {
      errors.value.push(`이미지를 넣으면 본문이 ${MAX_BODY_BYTES.toLocaleString()}바이트를 넘습니다. 본문을 줄인 뒤 다시 넣어 주세요.`);
      return null;
    }
    const text = accepted.map((item) => placeholderMarkdown(item.alt, item.tempId)).join(IMAGE_BLOCK_SEPARATOR);
    const result = insertBlock(options.getBody(), selectionStart, selectionEnd, text);
    options.setBody(result.body);
    queue.push(...accepted);
    total.value += accepted.length;
    if (!uploading.value) void run();
    return result.cursor;
  }

  async function run() {
    uploading.value = true;
    let inserted = 0;
    try {
      while (queue.length) {
        const item = queue[0]!;
        if (await uploadOne(item)) inserted += 1;
        queue.shift();
        done.value += 1;
      }
    } finally {
      uploading.value = false;
      lastNotice.value = inserted ? `이미지 ${inserted}장을 넣었습니다. 초안을 저장해야 반영됩니다.` : '';
      done.value = 0;
      total.value = 0;
    }
  }

  async function uploadOne(item: QueueItem): Promise<boolean> {
    const token = options.csrfToken();
    try {
      if (!token) throw Object.assign(new Error('missing session'), { statusCode: 401 });
      const response = await $fetch<ImageUploadResponse>('/api/v1/me/images', {
        method: 'POST',
        headers: { 'Content-Type': item.file.type, 'X-CSRF-Token': token },
        body: item.file,
      });
      if (!isInternalImageUrl(response?.url)) throw new Error('unexpected image url');
      const next = replacePlaceholder(options.getBody(), item.tempId, imageMarkdown(item.alt, response.url));
      if (next === null) return false; // 사용자가 임시 자리를 지웠다.
      options.setBody(next);
      return true;
    } catch (cause) {
      const status = apiErrorStatus(cause);
      if (isAuthFailure(status)) needsLogin.value = true;
      errors.value.push(`${item.file.name || item.alt}: ${uploadErrorMessage(status)}`);
      options.setBody(removePlaceholder(options.getBody(), item.tempId));
      return false;
    }
  }

  function clearMessages() {
    if (uploading.value) return;
    errors.value = [];
    needsLogin.value = false;
    lastNotice.value = '';
  }

  return { uploading: readonly(uploading), statusText, errors: readonly(errors), needsLogin: readonly(needsLogin), add, clearMessages };
}
