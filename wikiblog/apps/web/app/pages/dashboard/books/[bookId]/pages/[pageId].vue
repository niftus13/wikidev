<script setup lang="ts">
import type { BookDto, OwnedTocDto, PageDraftDto, PageVersionDto, PublishPageRequest, RestorePageRequest, SessionResponse, UpdatePageRequest } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';
import { renderMarkdown } from '~/utils/markdown';
import { pagePath } from '~/utils/paths';

definePageMeta({ key: (route) => route.path });
useSeoMeta({ title: '페이지 편집 — WikiBlog', robots: 'noindex' });
const route = useRoute();
const bookId = String(route.params.bookId);
const pageId = String(route.params.pageId);
const session = ref<SessionResponse | null>(null);
const book = ref<BookDto | null>(null);
const draft = ref<PageDraftDto | null>(null);
const published = ref(false);
const form = reactive({ title: '', body: '' });
const loading = ref(true);
const loadError = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');
const preview = ref(false);
const historyOpen = ref(false);
const versions = ref<PageVersionDto[]>([]);
const historyError = ref('');
const selectedVersionId = ref<string | null>(null);
const confirmingRestore = ref(false);
const dirty = computed(() => draft.value !== null && (form.title !== draft.value.title || form.body !== draft.value.body));
const bodyBytes = computed(() => new TextEncoder().encode(form.body).length);
const rendered = computed(() => preview.value ? renderMarkdown(form.body) : '');
const selectedVersion = computed(() => versions.value.find((version) => version.id === selectedVersionId.value));
const renderedVersion = computed(() => selectedVersion.value ? renderMarkdown(selectedVersion.value.body) : '');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const current = await $fetch<SessionResponse>('/api/v1/auth/session');
    const [books, page, toc] = await Promise.all([
      $fetch<BookDto[]>('/api/v1/me/books'),
      $fetch<PageDraftDto>(`/api/v1/me/pages/${pageId}`),
      $fetch<OwnedTocDto>(`/api/v1/me/books/${bookId}/toc`),
    ]);
    const selected = books.find((item) => item.id === bookId);
    const entry = toc.pages.find((item) => item.id === pageId);
    if (!selected || page.bookId !== bookId || !entry) throw createError({ statusCode: 404 });
    session.value = current;
    book.value = selected;
    draft.value = page;
    published.value = entry.published;
    form.title = page.title;
    form.body = page.body;
  } catch (cause) {
    loadError.value = apiErrorStatus(cause) === 401 ? 'login' : apiErrorStatus(cause) === 404 ? 'missing' : 'error';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function message(cause: unknown, action: 'save' | 'publish' | 'restore') {
  const status = apiErrorStatus(cause);
  if (status === 400 || status === 413) return '제목, 본문 크기 또는 요청 크기를 확인해 주세요.';
  if (status === 401 || status === 403) return '세션이 만료되었거나 인증 정보가 변경되었습니다. 입력을 복사해 보관한 뒤 다시 로그인해 주세요.';
  if (status === 404) return '페이지를 찾을 수 없거나 관리 권한이 없습니다. 입력을 복사해 보관해 주세요.';
  if (status === 409) return action === 'publish'
    ? '다른 변경과 충돌했거나 상위 페이지가 아직 발행되지 않았습니다. 입력을 보관하고 상태를 확인해 주세요.'
    : '다른 변경과 충돌했습니다. 입력을 복사해 보관한 뒤 새로고침하여 최신 초안을 확인해 주세요.';
  return '요청을 처리하지 못했습니다. 입력을 보관하고 다시 시도해 주세요.';
}
async function save() {
  if (busy.value || !session.value || !draft.value || !dirty.value || bodyBytes.value > 12000) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const body: UpdatePageRequest = { title: form.title, body: form.body, revision: draft.value.revision };
    const updated = await $fetch<PageDraftDto>(`/api/v1/pages/${pageId}`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': session.value.csrfToken }, body,
    });
    draft.value = updated;
    form.title = updated.title;
    form.body = updated.body;
    notice.value = '초안을 저장했습니다. 공개하려면 발행하세요.';
    if (historyOpen.value) await refreshVersions();
  } catch (cause) {
    error.value = message(cause, 'save');
  } finally {
    busy.value = false;
  }
}
async function refreshVersions() {
  historyError.value = '';
  try {
    versions.value = await $fetch<PageVersionDto[]>(`/api/v1/pages/${pageId}/versions`);
  } catch (cause) {
    historyError.value = `이력을 불러오지 못했습니다. ${message(cause, 'restore')}`;
  }
}
async function openHistory() {
  if (busy.value) return;
  historyOpen.value = true;
  busy.value = true;
  try {
    await refreshVersions();
  } finally {
    busy.value = false;
  }
}
async function restore() {
  if (busy.value || dirty.value || !session.value || !draft.value || !selectedVersion.value) return;
  busy.value = true;
  historyError.value = '';
  error.value = '';
  notice.value = '';
  try {
    const body: RestorePageRequest = { revision: draft.value.revision, versionId: selectedVersion.value.id };
    const restored = await $fetch<PageDraftDto>(`/api/v1/pages/${pageId}/restore`, {
      method: 'POST', headers: { 'X-CSRF-Token': session.value.csrfToken }, body,
    });
    draft.value = restored;
    form.title = restored.title;
    form.body = restored.body;
    confirmingRestore.value = false;
    selectedVersionId.value = null;
    notice.value = '이력을 새 초안으로 복원했습니다. 공개하려면 다시 발행하세요.';
    await refreshVersions();
  } catch (cause) {
    historyError.value = message(cause, 'restore');
  } finally {
    busy.value = false;
  }
}
async function publish() {
  if (busy.value || !session.value || !draft.value || dirty.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const body: PublishPageRequest = { revision: draft.value.revision };
    await $fetch<PageDraftDto>(`/api/v1/pages/${pageId}/publish`, {
      method: 'POST', headers: { 'X-CSRF-Token': session.value.csrfToken }, body,
    });
    published.value = true;
    notice.value = '저장된 초안을 발행했습니다.';
  } catch (cause) {
    error.value = message(cause, 'publish');
  } finally {
    busy.value = false;
  }
}
function canLeave() {
  if (busy.value) {
    error.value = '요청이 처리되는 동안 기다려 주세요.';
    return false;
  }
  return !dirty.value || window.confirm('저장하지 않은 변경 사항이 있습니다. 이 화면을 나가시겠습니까?');
}
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) event.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));
</script>

<template>
  <div class="container dashboard-page narrow">
    <div class="breadcrumbs"><NuxtLink to="/dashboard/books">내 책 관리</NuxtLink><span>/</span><NuxtLink :to="`/dashboard/books/${bookId}/pages`">페이지 관리</NuxtLink><span>/</span><span>편집</span></div>
    <p class="eyebrow dashboard-eyebrow">AUTHOR · EDITOR</p>
    <h1>페이지 편집</h1>
    <p v-if="loading" class="state" role="status">초안을 불러오는 중입니다.</p>
    <div v-else-if="loadError === 'login'" class="state">페이지를 편집하려면 <NuxtLink class="text-link" to="/login">로그인</NuxtLink>하세요.</div>
    <div v-else-if="loadError" class="state" role="alert">
      {{ loadError === 'missing' ? '페이지를 찾을 수 없거나 관리 권한이 없습니다.' : '초안을 불러오지 못했습니다.' }}
      <button class="link-button" type="button" @click="load()">다시 시도</button>
    </div>
    <template v-else-if="book && draft && session">
      <p class="page-intro">{{ book.title }} · {{ published ? '발행됨' : '미발행' }} · revision {{ draft.revision }}</p>
      <p class="field-help">저장은 초안에만 반영됩니다. 저장된 초안을 발행해야 공개됩니다.</p>
      <form class="editor-form page-editor" @submit.prevent="save">
        <label for="page-title">제목</label>
        <input id="page-title" v-model="form.title" maxlength="200" :disabled="busy" required>
        <label for="page-body">본문 (Markdown)</label>
        <textarea id="page-body" v-model="form.body" rows="18" :disabled="busy" aria-describedby="page-body-help" />
        <p id="page-body-help" class="field-help" :class="{ 'form-error': bodyBytes > 12000 }">본문 {{ bodyBytes }} / 12000바이트. 전체 요청 크기는 16KB로 제한됩니다.</p>
        <p v-if="error" class="form-error" role="alert">{{ error }} <NuxtLink v-if="error.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
        <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
        <div class="form-actions">
          <button class="button button-primary" type="submit" :disabled="busy || !dirty || bodyBytes > 12000">초안 저장</button>
          <button class="button button-secondary" type="button" :disabled="busy || dirty" @click="publish">{{ published ? '다시 발행' : '발행' }}</button>
          <button class="button button-secondary" type="button" @click="preview = !preview">{{ preview ? '미리보기 닫기' : '미리보기' }}</button>
          <NuxtLink v-if="published" class="text-link" :to="pagePath(session.space.handle, book.slug, pageId)" target="_blank">공개 페이지 보기</NuxtLink>
        </div>
        <p v-if="dirty" class="field-help">발행하려면 먼저 변경 사항을 저장하세요.</p>
      </form>
      <section v-if="preview" class="editor-panel" aria-labelledby="preview-heading">
        <h2 id="preview-heading">미리보기</h2>
        <div class="markdown-body" v-html="rendered" />
      </section>
      <section class="editor-panel" aria-labelledby="history-heading">
        <div class="history-heading">
          <h2 id="history-heading">변경 이력</h2>
          <button v-if="!historyOpen" class="button button-secondary" type="button" :disabled="busy" @click="openHistory">이력 보기</button>
          <button v-else class="button button-secondary" type="button" :disabled="busy" @click="historyOpen = false; selectedVersionId = null; confirmingRestore = false">이력 닫기</button>
        </div>
        <template v-if="historyOpen">
          <p class="field-help">복원은 분류를 포함한 새 초안을 만들며 발행본을 즉시 변경하지 않습니다.</p>
          <p v-if="historyError" class="form-error" role="alert">{{ historyError }}</p>
          <button class="link-button history-refresh" type="button" :disabled="busy" @click="openHistory">이력 새로고침</button>
          <p v-if="busy" class="state" role="status">요청을 처리하는 중입니다.</p>
          <p v-else-if="!versions.length && !historyError" class="state">변경 이력이 없습니다.</p>
          <ul v-if="versions.length" class="history-list">
            <li v-for="version in versions" :key="version.id">
              <button class="link-button" type="button" :disabled="busy" @click="selectedVersionId = version.id; confirmingRestore = false">revision {{ version.revision }} · {{ version.title }}</button>
              <time :datetime="version.createdAt">{{ new Date(version.createdAt).toLocaleString() }}</time>
            </li>
          </ul>
          <div v-if="selectedVersion" class="version-preview">
            <h3>revision {{ selectedVersion.revision }} · {{ selectedVersion.title }}</h3>
            <div class="markdown-body" v-html="renderedVersion" />
            <p v-if="!selectedVersion.body" class="field-help">본문이 비어 있습니다.</p>
            <p v-if="dirty" class="field-help">복원하려면 현재 변경 사항을 저장하거나 입력을 보관하고 새로고침하세요.</p>
            <button v-if="!confirmingRestore" class="button button-secondary" type="button" :disabled="busy || dirty" @click="confirmingRestore = true">이 버전 복원</button>
            <div v-else class="delete-confirm">
              <p>현재 저장된 초안을 이 이력으로 복원하시겠습니까? 복원은 새 이력을 만들고 공개본은 유지합니다.</p>
              <button class="button button-primary" type="button" :disabled="busy || dirty" @click="restore">복원 확인</button>
              <button class="button button-secondary" type="button" :disabled="busy" @click="confirmingRestore = false">취소</button>
            </div>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
