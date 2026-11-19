<script setup lang="ts">
import type { BookDto, CreateBookRequest, SessionResponse, SpaceDto, UpdateSpaceRequest } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';
import { bookPath, spacePath } from '~/utils/paths';
import { characterCount, SPACE_DESCRIPTION_LIMIT } from '~/utils/space';

useSeoMeta({ title: '내 책 관리 — WikiBlog', robots: 'noindex' });
const currentUser = useCurrentUser();
const session = ref<SessionResponse | null>(null);
const books = ref<BookDto[]>([]);
const loading = ref(true);
const loadError = ref('');
const busy = ref(false);
const formMode = ref<'create' | 'edit' | null>(null);
const editingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const form = reactive<CreateBookRequest>({ slug: '', title: '', description: '' });
const actionError = ref('');
const notice = ref('');
const classifyingId = ref<string | null>(null);
const classificationPanel = ref<Array<{ changed: boolean; busy: boolean }>>([]);
const classificationChanged = () => classificationPanel.value.some((panel) => panel.changed || panel.busy);
function toggleClassification(book: BookDto) {
  if (classifyingId.value === book.id) return closeClassification();
  if (classifyingId.value && classificationChanged()
    && !window.confirm('저장하지 않은 분류 변경이 있습니다. 다른 책의 분류를 여시겠습니까?')) return;
  classifyingId.value = book.id;
  deletingId.value = null;
  actionError.value = '';
}
function closeClassification() {
  if (classificationChanged() && !window.confirm('저장하지 않은 분류 변경이 있습니다. 분류 패널을 닫으시겠습니까?')) return;
  classifyingId.value = null;
}

// 내 공간 소개 편집. 저장 즉시 공개 공간(/@{handle})에 반영된다.
const route = useRoute();
const spaceEditing = ref(false);
const spaceDraft = ref('');
const spaceBusy = ref(false);
const spaceError = ref('');
const spaceErrorStatus = ref<number | undefined>();
const spaceNotice = ref('');
const spaceTextarea = ref<HTMLTextAreaElement | null>(null);
const spaceLength = computed(() => characterCount(spaceDraft.value));
const spaceOver = computed(() => spaceLength.value > SPACE_DESCRIPTION_LIMIT);
const spaceDirty = computed(() => spaceEditing.value && !!session.value && spaceDraft.value !== session.value.space.description);
async function openSpaceEditor() {
  if (!session.value) return;
  spaceDraft.value = session.value.space.description;
  spaceEditing.value = true;
  spaceError.value = '';
  spaceNotice.value = '';
  await nextTick();
  spaceTextarea.value?.focus();
}
function closeSpaceEditor() {
  if (spaceDirty.value && !window.confirm('저장하지 않은 공간 소개 변경을 버리시겠습니까?')) return;
  spaceEditing.value = false;
  spaceError.value = '';
}
function describeSpaceError(status: number | undefined) {
  if (status === 400) return `소개는 ${SPACE_DESCRIPTION_LIMIT}자 이하의 텍스트여야 합니다. 입력 내용을 확인해 주세요.`;
  if (status === 401) return '세션이 만료되었습니다. 다른 탭에서 다시 로그인한 뒤 저장을 다시 시도해 주세요. 입력한 소개는 유지됩니다.';
  if (status === 403) return '인증 정보가 변경되었거나 요청이 거부되었습니다. 입력을 복사해 보관한 뒤 새로고침해 주세요.';
  if (status === 404) return '공간을 찾을 수 없거나 수정 권한이 없습니다. 입력을 복사해 보관한 뒤 새로고침해 주세요.';
  return '소개를 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요. 입력한 소개는 유지됩니다.';
}
async function saveSpace() {
  if (spaceBusy.value || !session.value || spaceOver.value) return;
  spaceBusy.value = true;
  spaceError.value = '';
  spaceErrorStatus.value = undefined;
  spaceNotice.value = '';
  try {
    const body: UpdateSpaceRequest = { description: spaceDraft.value };
    const space = await $fetch<SpaceDto>(`/api/v1/spaces/${encodeURIComponent(session.value.space.handle)}`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': session.value.csrfToken }, body,
    });
    session.value = { ...session.value, space };
    spaceEditing.value = false;
    spaceNotice.value = '공간 소개를 저장했습니다. 공개 공간에 바로 반영됩니다.';
  } catch (cause) {
    spaceErrorStatus.value = apiErrorStatus(cause);
    spaceError.value = describeSpaceError(spaceErrorStatus.value);
  } finally {
    spaceBusy.value = false;
  }
}

// 분류 패널과 공간 소개의 미저장 변경을 함께 확인한다.
function unsavedMessage() {
  const parts = [spaceDirty.value || spaceBusy.value ? '공간 소개' : '', classificationChanged() ? '분류' : ''].filter(Boolean);
  return parts.length ? `저장하지 않은 ${parts.join('·')} 변경이 있습니다. 이 화면을 나가시겠습니까?` : '';
}
onBeforeRouteLeave(() => {
  const message = unsavedMessage();
  return !message || window.confirm(message);
});
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (unsavedMessage()) event.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const current = await $fetch<SessionResponse>('/api/v1/auth/session');
    const list = await $fetch<BookDto[]>('/api/v1/me/books');
    session.value = current;
    books.value = list;
    currentUser.set(current);
    if (route.query.space === 'edit' && !spaceEditing.value) {
      loading.value = false;
      await openSpaceEditor();
    }
  } catch (cause) {
    session.value = null;
    const status = apiErrorStatus(cause);
    if (status === 401) currentUser.set(null);
    loadError.value = status === 401 ? 'login' : 'error';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openForm(book?: BookDto) {
  formMode.value = book ? 'edit' : 'create';
  editingId.value = book?.id ?? null;
  Object.assign(form, { slug: book?.slug ?? '', title: book?.title ?? '', description: book?.description ?? '' });
  deletingId.value = null;
  actionError.value = '';
  notice.value = '';
}
function closeForm() {
  formMode.value = null;
  editingId.value = null;
  actionError.value = '';
}
function describeError(cause: unknown) {
  const status = apiErrorStatus(cause);
  if (status === 400 || status === 413) return '입력 내용을 확인해 주세요. 요청 크기 제한을 초과했을 수도 있습니다.';
  if (status === 401) return '세션이 만료되었습니다. 다른 탭에서 다시 로그인한 뒤 이 화면의 입력을 복사해 보관해 주세요.';
  if (status === 403) return '인증 정보가 변경되었거나 요청이 거부되었습니다. 입력을 복사해 보관한 뒤 새로고침해 주세요.';
  if (status === 404) return '책을 찾을 수 없거나 관리 권한이 없습니다. 목록을 새로고침해 주세요.';
  if (status === 409) return '이미 사용 중인 주소입니다. 삭제된 책의 주소도 다시 사용할 수 없습니다.';
  return '요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
async function save() {
  if (busy.value || !session.value || !formMode.value) return;
  busy.value = true;
  actionError.value = '';
  notice.value = '';
  try {
    const body: CreateBookRequest = { slug: form.slug, title: form.title, description: form.description };
    const book = formMode.value === 'create'
      ? await $fetch<BookDto>('/api/v1/me/books', { method: 'POST', headers: { 'X-CSRF-Token': session.value.csrfToken }, body })
      : await $fetch<BookDto>(`/api/v1/books/${editingId.value}`, { method: 'PATCH', headers: { 'X-CSRF-Token': session.value.csrfToken }, body });
    books.value = formMode.value === 'create' ? [book, ...books.value] : books.value.map((item) => item.id === book.id ? book : item);
    notice.value = formMode.value === 'create' ? '책을 만들었습니다. 책은 즉시 공개됩니다.' : '책을 수정했습니다.';
    closeForm();
  } catch (cause) {
    actionError.value = describeError(cause);
  } finally {
    busy.value = false;
  }
}
async function remove(book: BookDto) {
  if (busy.value || !session.value) return;
  busy.value = true;
  actionError.value = '';
  notice.value = '';
  try {
    await $fetch(`/api/v1/books/${book.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': session.value.csrfToken }, body: {} });
    books.value = books.value.filter((item) => item.id !== book.id);
    deletingId.value = null;
    notice.value = '책을 삭제했습니다.';
  } catch (cause) {
    actionError.value = describeError(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="container dashboard-page narrow">
    <p class="eyebrow">AUTHOR</p>
    <div class="section-heading">
      <div><h1>내 책 관리</h1><p>책을 만들고 소개를 관리하세요. <NuxtLink v-if="session" class="text-link" to="/dashboard/categories">분류 관리</NuxtLink></p></div>
      <button v-if="session && !formMode" class="button button-primary" type="button" :disabled="busy" @click="openForm()">새 책 만들기</button>
    </div>
    <p v-if="loading" class="state" role="status">계정과 책을 불러오는 중입니다.</p>
    <div v-else-if="loadError === 'login'" class="state">
      <p v-if="notice" role="status">{{ notice }}</p>
      <p>책을 관리하려면 로그인하세요.</p>
      <NuxtLink class="button button-primary" to="/login">로그인</NuxtLink>
      <NuxtLink class="text-link inline-link" to="/register">회원가입</NuxtLink>
    </div>
    <div v-else-if="loadError" class="state" role="alert">계정 또는 책을 불러오지 못했습니다. <button class="link-button" @click="load()">다시 시도</button></div>
    <template v-else-if="session">
      <section class="editor-panel space-panel" aria-labelledby="space-heading">
        <div class="space-panel-heading">
          <h2 id="space-heading">내 공간</h2>
          <NuxtLink class="text-link" :to="spacePath(session.space.handle)">공개 공간 보기 <span aria-hidden="true">→</span></NuxtLink>
        </div>
        <p class="field-help">공개 주소 <strong>{{ spacePath(session.space.handle) }}</strong> · 소개는 일반 텍스트로 표시되며 저장하면 즉시 공개됩니다.</p>
        <p v-if="spaceNotice" class="form-success" role="status">{{ spaceNotice }}</p>
        <template v-if="!spaceEditing">
          <p class="space-panel-current">{{ session.space.description || '소개가 아직 작성되지 않았습니다.' }}</p>
          <div class="form-actions"><button class="button button-secondary" type="button" @click="openSpaceEditor">소개 편집</button></div>
        </template>
        <form v-else class="editor-form" novalidate @submit.prevent="saveSpace">
          <label for="space-description">공간 소개</label>
          <textarea
            id="space-description" ref="spaceTextarea" v-model="spaceDraft" rows="4" :disabled="spaceBusy"
            :aria-invalid="spaceOver" aria-describedby="space-description-count space-description-help"
          />
          <p id="space-description-count" class="char-counter" :class="{ over: spaceOver }">{{ spaceLength }} / {{ SPACE_DESCRIPTION_LIMIT }}자</p>
          <p id="space-description-help" class="field-help">줄바꿈은 유지되고 HTML과 Markdown은 그대로 글자로 보입니다. 저장하면 공개 공간에 즉시 반영됩니다.</p>
          <p v-if="spaceOver" class="form-error" role="alert">소개는 {{ SPACE_DESCRIPTION_LIMIT }}자까지 저장할 수 있습니다. {{ spaceLength - SPACE_DESCRIPTION_LIMIT }}자를 줄여 주세요.</p>
          <p v-if="spaceError" class="form-error" role="alert">{{ spaceError }} <NuxtLink v-if="spaceErrorStatus === 401" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
          <div class="form-actions">
            <button class="button button-primary" type="submit" :disabled="spaceBusy || spaceOver">{{ spaceBusy ? '저장 중…' : '소개 저장' }}</button>
            <button class="button button-secondary" type="button" :disabled="spaceBusy" @click="closeSpaceEditor">취소</button>
          </div>
        </form>
      </section>
      <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
      <p v-if="actionError && !formMode" class="form-error" role="alert">{{ actionError }} <NuxtLink v-if="actionError.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
      <section v-if="formMode" class="editor-panel" aria-labelledby="book-form-heading">
        <h2 id="book-form-heading">{{ formMode === 'create' ? '새 책 만들기' : '책 수정' }}</h2>
        <p class="field-help">책은 생성 즉시 공개됩니다. 주소를 바꾸면 기존 주소의 링크가 변경됩니다.</p>
        <form class="editor-form" @submit.prevent="save">
          <label for="book-title">제목</label>
          <input id="book-title" v-model="form.title" maxlength="200" :disabled="busy" required>
          <label for="book-slug">책 주소</label>
          <input id="book-slug" v-model="form.slug" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" :disabled="busy" required aria-describedby="slug-help">
          <p id="slug-help" class="field-help">영문 소문자와 숫자를 하이픈으로 연결하세요. 삭제한 책의 주소도 보존됩니다.</p>
          <label for="book-description">소개</label>
          <textarea id="book-description" v-model="form.description" maxlength="5000" rows="5" :disabled="busy" />
          <p v-if="actionError" class="form-error" role="alert">{{ actionError }} <NuxtLink v-if="actionError.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
          <div class="form-actions">
            <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? '저장 중…' : formMode === 'create' ? '책 만들기' : '변경 저장' }}</button>
            <button class="button button-secondary" type="button" :disabled="busy" @click="closeForm">취소</button>
          </div>
        </form>
      </section>
      <div v-if="!books.length" class="state">아직 만든 책이 없습니다.</div>
      <ul v-else class="managed-books">
        <li v-for="book in books" :key="book.id">
          <div class="managed-book-content">
            <h2>{{ book.title }}</h2>
            <p class="field-help">/{{ book.slug }}</p>
            <p>{{ book.description || '소개가 아직 작성되지 않았습니다.' }}</p>
          </div>
          <div class="managed-book-actions">
            <NuxtLink class="text-link" :to="bookPath(session.space.handle, book.slug)">공개 책 보기</NuxtLink>
            <NuxtLink class="text-link" :to="`/dashboard/books/${book.id}/pages`">페이지 관리</NuxtLink>
            <button class="link-button" type="button" :disabled="busy || !!formMode" :aria-expanded="classifyingId === book.id" @click="toggleClassification(book)">분류</button>
            <button class="link-button" type="button" :disabled="busy || !!formMode" @click="openForm(book)">수정</button>
            <button class="link-button danger-link" type="button" :disabled="busy || !!formMode" @click="deletingId = book.id; actionError = ''">삭제</button>
          </div>
          <BookClassificationPanel v-if="classifyingId === book.id" ref="classificationPanel" :book-id="book.id" :csrf-token="session.csrfToken" @close="closeClassification" />
          <div v-if="deletingId === book.id" class="delete-confirm">
            <p>책과 모든 페이지가 삭제되며 복구할 수 없습니다. 삭제하시겠습니까?</p>
            <button class="button button-danger" type="button" :disabled="busy" @click="remove(book)">{{ busy ? '삭제 중…' : '삭제 확인' }}</button>
            <button class="button button-secondary" type="button" :disabled="busy" @click="deletingId = null">취소</button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
