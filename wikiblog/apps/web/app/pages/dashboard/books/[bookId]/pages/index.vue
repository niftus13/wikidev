<script setup lang="ts">
import type { BookDto, CreatePageRequest, MovePageRequest, OwnedTocDto, OwnedTocEntryDto, PageDraftDto, SessionResponse, UnpublishPageResponse } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';
import { moveSiblings, possibleParents, publishedDescendantCount } from '~/utils/toc';

definePageMeta({ key: (route) => route.path });
usePageMeta({ title: '페이지 관리', noindex: true });
const route = useRoute();
const bookId = String(route.params.bookId);
const session = ref<SessionResponse | null>(null);
const book = ref<BookDto | null>(null);
const toc = ref<OwnedTocDto | null>(null);
const loading = ref(true);
const loadError = ref('');
const busy = ref(false);
const creating = ref(false);
const title = ref('');
const deletingId = ref<string | null>(null);
const unpublishingId = ref<string | null>(null);
const movingId = ref<string | null>(null);
const moveParent = ref('');
const movePosition = ref(0);
const moveConflict = ref(false);
const error = ref('');
const notice = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const current = await $fetch<SessionResponse>('/api/v1/auth/session');
    const [books, tree] = await Promise.all([
      $fetch<BookDto[]>('/api/v1/me/books'),
      $fetch<OwnedTocDto>(`/api/v1/me/books/${bookId}/toc`),
    ]);
    const selected = books.find((item) => item.id === bookId);
    if (!selected) throw createError({ statusCode: 404 });
    session.value = current;
    book.value = selected;
    toc.value = tree;
  } catch (cause) {
    loadError.value = apiErrorStatus(cause) === 401 ? 'login' : apiErrorStatus(cause) === 404 ? 'missing' : 'error';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function message(cause: unknown) {
  const status = apiErrorStatus(cause);
  if (status === 400 || status === 413) return '제목 또는 요청 크기를 확인해 주세요.';
  if (status === 401 || status === 403) return '세션이 만료되었거나 인증 정보가 변경되었습니다. 입력을 보관하고 다시 로그인해 주세요.';
  if (status === 404) return '책 또는 페이지를 찾을 수 없거나 관리 권한이 없습니다.';
  return '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
}
async function createPage() {
  if (busy.value || !session.value || !toc.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const body: CreatePageRequest = { title: title.value, body: '' };
    await $fetch<PageDraftDto>(`/api/v1/books/${bookId}/pages`, {
      method: 'POST', headers: { 'X-CSRF-Token': session.value.csrfToken }, body,
    });
    title.value = '';
    creating.value = false;
    notice.value = '초안을 만들었습니다. 페이지 제목을 선택해 내용을 작성하세요.';
    try {
      toc.value = await $fetch<OwnedTocDto>(`/api/v1/me/books/${bookId}/toc`);
    } catch (cause) {
      toc.value = null;
      error.value = `초안은 생성되었지만 목록을 갱신하지 못했습니다. ${message(cause)}`;
    }
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
const parentOptions = computed(() => toc.value && movingId.value ? possibleParents(toc.value.pages, movingId.value) : []);
const siblings = computed(() => toc.value && movingId.value
  ? moveSiblings(toc.value.pages, movingId.value, moveParent.value || null) : []);
function openMove(page: OwnedTocEntryDto) {
  movingId.value = page.id;
  moveParent.value = page.parentId ?? '';
  movePosition.value = page.position;
  deletingId.value = null;
  unpublishingId.value = null;
  moveConflict.value = false;
  error.value = '';
  notice.value = '';
}
async function movePage() {
  if (busy.value || !session.value || !toc.value || !movingId.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  moveConflict.value = false;
  try {
    const body: MovePageRequest = {
      revision: toc.value.revision, pageId: movingId.value, parentId: moveParent.value || null, position: movePosition.value,
    };
    toc.value = await $fetch<OwnedTocDto>(`/api/v1/books/${bookId}/toc`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': session.value.csrfToken }, body,
    });
    movingId.value = null;
    notice.value = '목차를 변경했습니다. 발행된 페이지의 공개 목차에도 즉시 반영됩니다.';
  } catch (cause) {
    if (apiErrorStatus(cause) === 409) {
      error.value = '목차가 변경되었거나 발행된 페이지의 상위 페이지가 미발행 상태입니다. 최신 목차와 발행 상태를 확인해 주세요.';
      moveConflict.value = true;
    } else error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
async function reloadToc() {
  movingId.value = null;
  moveConflict.value = false;
  error.value = '';
  await load();
}
async function deletePage(id: string) {
  if (busy.value || !session.value || !toc.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await $fetch(`/api/v1/pages/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': session.value.csrfToken }, body: {} });
    deletingId.value = null;
    notice.value = '페이지와 하위 페이지를 삭제했습니다.';
    try {
      toc.value = await $fetch<OwnedTocDto>(`/api/v1/me/books/${bookId}/toc`);
    } catch (cause) {
      toc.value = null;
      error.value = `삭제는 완료되었지만 목록을 갱신하지 못했습니다. ${message(cause)}`;
    }
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
function openUnpublish(id: string) {
  unpublishingId.value = id;
  deletingId.value = null;
  error.value = '';
  notice.value = '';
  void nextTick(() => document.getElementById(`unpublish-confirm-${id}`)?.focus());
}
function closeUnpublish(id: string) {
  unpublishingId.value = null;
  void nextTick(() => document.getElementById(`unpublish-${id}`)?.focus());
}
async function unpublishPage(id: string) {
  if (busy.value || !session.value || !toc.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await $fetch<UnpublishPageResponse>(`/api/v1/pages/${id}/unpublish`, {
      method: 'POST', headers: { 'X-CSRF-Token': session.value.csrfToken }, body: {},
    });
    // 응답의 페이지만 미발행으로 바꾼다. 이미 미발행이었다면(빈 배열) 요청한 페이지 상태만 맞춘다.
    const changed = new Set([id, ...result.unpublishedPageIds]);
    toc.value = { ...toc.value, pages: toc.value.pages.map((page) => changed.has(page.id) ? { ...page, published: false } : page) };
    unpublishingId.value = null;
    const descendants = result.unpublishedPageIds.filter((item) => item !== id).length;
    notice.value = !result.unpublishedPageIds.length
      ? '이미 발행되지 않은 페이지입니다. 상태를 갱신했습니다.'
      : `발행을 취소했습니다${descendants ? ` (하위 페이지 ${descendants}개 포함)` : ''}. 초안과 이력은 그대로이며 다시 발행할 수 있습니다.`;
  } catch (cause) {
    error.value = apiErrorStatus(cause) === 404 ? '페이지를 찾을 수 없거나 관리 권한이 없습니다. 목록을 새로고침해 주세요.' : message(cause);
  } finally {
    busy.value = false;
  }
}
const pages = computed(() => {
  const depths = new Map<string, number>();
  return (toc.value?.pages ?? []).map((page) => {
    const depth = page.parentId ? (depths.get(page.parentId) ?? 0) + 1 : 0;
    depths.set(page.id, depth);
    return { ...page, depth };
  });
});
function canLeave() {
  if (busy.value) {
    error.value = '요청이 처리되는 동안 기다려 주세요.';
    return false;
  }
  if (creating.value && title.value) return window.confirm('작성 중인 제목이 있습니다. 이 화면을 나가시겠습니까?');
  if (movingId.value) return window.confirm('목차 이동을 적용하지 않았습니다. 이 화면을 나가시겠습니까?');
  return true;
}
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (busy.value || movingId.value || (creating.value && title.value)) event.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));
</script>

<template>
  <div class="container dashboard-page narrow">
    <div class="breadcrumbs"><NuxtLink to="/dashboard/books">내 책 관리</NuxtLink><span>/</span><span>페이지 관리</span></div>
    <p class="eyebrow dashboard-eyebrow">AUTHOR · PAGES</p>
    <div class="section-heading">
      <div><h1>페이지 관리</h1><p v-if="book">{{ book.title }} · <NuxtLink class="text-link" :to="`/dashboard/books/${bookId}/categories`">페이지 카테고리</NuxtLink></p></div>
      <button v-if="book && toc && !creating && !movingId" class="button button-primary" type="button" :disabled="busy" @click="creating = true; deletingId = null; error = ''; notice = ''">새 페이지</button>
    </div>
    <p v-if="loading" class="state" role="status">페이지를 불러오는 중입니다.</p>
    <div v-else-if="loadError === 'login'" class="state">페이지를 관리하려면 <NuxtLink class="text-link" to="/login">로그인</NuxtLink>하세요.</div>
    <div v-else-if="loadError" class="state" role="alert">
      {{ loadError === 'missing' ? '책을 찾을 수 없거나 관리 권한이 없습니다.' : '페이지를 불러오지 못했습니다.' }}
      <button class="link-button" type="button" @click="load()">다시 시도</button>
    </div>
    <template v-else>
      <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button v-if="moveConflict" class="link-button" type="button" :disabled="busy" @click="reloadToc">이동 선택을 취소하고 최신 목차 불러오기</button>
      <button v-if="!toc" class="link-button" type="button" @click="load()">목록 다시 불러오기</button>
      <section v-if="creating && toc" class="editor-panel" aria-labelledby="create-page-heading">
        <h2 id="create-page-heading">새 페이지</h2>
        <p class="field-help">제목으로 빈 초안을 만든 뒤 내용을 작성할 수 있습니다. 발행 전에는 공개되지 않습니다.</p>
        <form class="editor-form" @submit.prevent="createPage">
          <label for="new-page-title">페이지 제목</label>
          <input id="new-page-title" v-model="title" maxlength="200" :disabled="busy" required>
          <div class="form-actions">
            <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? '생성 중…' : '초안 만들기' }}</button>
            <button class="button button-secondary" type="button" :disabled="busy" @click="creating = false; error = ''">취소</button>
          </div>
        </form>
      </section>
      <p v-if="toc && !pages.length" class="state">아직 페이지가 없습니다.</p>
      <ul v-else-if="toc" class="managed-books page-list">
        <li v-for="page in pages" :key="page.id">
          <div class="managed-book-content">
            <p class="page-depth">깊이 {{ page.depth + 1 }} · {{ page.published ? '발행됨' : '미발행' }}</p>
            <h2><NuxtLink class="page-title-link" :to="`/dashboard/books/${bookId}/pages/${page.id}`">{{ page.title }}</NuxtLink></h2>
            <p v-if="page.parentId" class="field-help">상위: {{ pages.find((item) => item.id === page.parentId)?.title }}</p>
          </div>
          <div class="managed-book-actions">
            <NuxtLink class="text-link" :to="`/dashboard/books/${bookId}/pages/${page.id}`">편집</NuxtLink>
            <button class="link-button" type="button" :disabled="busy || creating || !!movingId" @click="openMove(page)">이동</button>
            <button v-if="page.published" :id="`unpublish-${page.id}`" class="link-button" type="button" :disabled="busy || creating || !!movingId" :aria-expanded="unpublishingId === page.id" @click="openUnpublish(page.id)">발행 취소</button>
            <button class="link-button danger-link" type="button" :disabled="busy || creating || !!movingId" @click="deletingId = page.id; unpublishingId = null; error = ''; notice = ''">삭제</button>
          </div>
          <form v-if="movingId === page.id" class="editor-form move-form" @submit.prevent="movePage">
            <p class="field-help">발행된 페이지는 모든 상위 페이지가 발행된 위치로만 이동할 수 있습니다.</p>
            <label :for="`move-parent-${page.id}`">상위 페이지</label>
            <select :id="`move-parent-${page.id}`" v-model="moveParent" :disabled="busy" @change="movePosition = siblings.length">
              <option value="">최상위</option>
              <option v-for="parent in parentOptions" :key="parent.id" :value="parent.id">{{ parent.title }} · {{ parent.id.slice(0, 8) }}</option>
            </select>
            <label :for="`move-position-${page.id}`">순서</label>
            <select :id="`move-position-${page.id}`" v-model.number="movePosition" :disabled="busy">
              <option :value="0">맨 앞</option>
              <option v-for="(sibling, index) in siblings" :key="sibling.id" :value="index + 1">{{ sibling.title }} · {{ sibling.id.slice(0, 8) }} 뒤</option>
            </select>
            <div class="form-actions">
              <button class="button button-primary" type="submit" :disabled="busy || moveConflict">이동 적용</button>
              <button class="button button-secondary" type="button" :disabled="busy" @click="movingId = null; moveConflict = false; error = ''">취소</button>
            </div>
          </form>
          <div v-if="unpublishingId === page.id && page.published" class="delete-confirm" role="group" :aria-labelledby="`unpublish-text-${page.id}`">
            <p :id="`unpublish-text-${page.id}`">
              {{ publishedDescendantCount(toc.pages, page.id)
                ? `이 페이지와 하위 발행 페이지 ${publishedDescendantCount(toc.pages, page.id)}개가 공개에서 빠집니다.`
                : '이 페이지가 공개에서 빠집니다.' }}
              초안과 이력은 그대로 남고 다시 발행할 수 있습니다.
            </p>
            <button :id="`unpublish-confirm-${page.id}`" class="button button-danger" type="button" :disabled="busy" @click="unpublishPage(page.id)">{{ busy ? '취소하는 중…' : '발행 취소 확인' }}</button>
            <button class="button button-secondary" type="button" :disabled="busy" @click="closeUnpublish(page.id)">닫기</button>
          </div>
          <div v-if="deletingId === page.id" class="delete-confirm">
            <p>이 페이지와 모든 하위 페이지가 삭제되며 복구할 수 없습니다. 삭제하시겠습니까?</p>
            <button class="button button-danger" type="button" :disabled="busy" @click="deletePage(page.id)">{{ busy ? '삭제 중…' : '삭제 확인' }}</button>
            <button class="button button-secondary" type="button" :disabled="busy" @click="deletingId = null">취소</button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
