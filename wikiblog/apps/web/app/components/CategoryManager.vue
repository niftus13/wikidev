<script setup lang="ts">
import type { CategoryDto, CategoryInput } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';
import { categoryOptionLabel, categoryParentOptions, categoryTree } from '~/utils/categories';

const props = defineProps<{
  /** 목록 조회 경로 (예: /api/v1/me/categories) */
  listUrl: string;
  /** 생성·수정·삭제 기준 경로 (예: /api/v1/me/categories) */
  mutateUrl: string;
  csrfToken: string;
  heading: string;
  description: string;
  idPrefix: string;
}>();

const categories = ref<CategoryDto[]>([]);
const loading = ref(true);
const loadError = ref('');
const busy = ref(false);
const formMode = ref<'create' | 'edit' | null>(null);
const editingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const form = reactive<{ name: string; parentId: string }>({ name: '', parentId: '' });
const error = ref('');
const notice = ref('');
const tree = computed(() => categoryTree(categories.value));
const parentOptions = computed(() => categoryParentOptions(categories.value, editingId.value));
const nameOf = (id: string | null) => categories.value.find((item) => item.id === id)?.name;

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    categories.value = await $fetch<CategoryDto[]>(props.listUrl);
  } catch (cause) {
    const status = apiErrorStatus(cause);
    loadError.value = status === 401 ? 'login' : status === 404 ? 'missing' : 'error';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function message(cause: unknown, action: 'save' | 'delete') {
  const status = apiErrorStatus(cause);
  if (status === 400) return action === 'save'
    ? '이름(1~100자)과 상위 카테고리를 확인해 주세요. 자기 자신이나 하위 카테고리 아래로는 옮길 수 없습니다.'
    : '요청을 처리하지 못했습니다. 목록을 새로고침해 주세요.';
  if (status === 401) return '세션이 만료되었습니다. 다른 탭에서 다시 로그인한 뒤 이 화면의 입력을 복사해 보관해 주세요.';
  if (status === 403) return '인증 정보가 변경되었거나 요청이 거부되었습니다. 입력을 복사해 보관한 뒤 새로고침해 주세요.';
  if (status === 404) return '카테고리를 찾을 수 없거나 관리 권한이 없습니다. 다른 탭에서 바뀌었을 수 있으니 목록을 새로고침해 주세요.';
  if (status === 409) return '하위 카테고리가 있거나 책·페이지(삭제된 콘텐츠와 과거 이력 포함)에 연결된 카테고리는 삭제할 수 없습니다. 하위 카테고리를 먼저 옮기거나 삭제하고, 연결된 분류를 해제한 뒤 다시 시도해 주세요.';
  return '요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
function openForm(category?: CategoryDto) {
  formMode.value = category ? 'edit' : 'create';
  editingId.value = category?.id ?? null;
  form.name = category?.name ?? '';
  form.parentId = category?.parentId ?? '';
  deletingId.value = null;
  error.value = '';
  notice.value = '';
}
function closeForm() {
  formMode.value = null;
  editingId.value = null;
  error.value = '';
}
async function save() {
  if (busy.value || !formMode.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const body: CategoryInput = { name: form.name, parentId: form.parentId || null };
    const saved = formMode.value === 'create'
      ? await $fetch<CategoryDto>(props.mutateUrl, { method: 'POST', headers: { 'X-CSRF-Token': props.csrfToken }, body })
      : await $fetch<CategoryDto>(`${props.mutateUrl}/${editingId.value}`, { method: 'PATCH', headers: { 'X-CSRF-Token': props.csrfToken }, body });
    const exists = categories.value.some((item) => item.id === saved.id);
    categories.value = exists
      ? categories.value.map((item) => item.id === saved.id ? saved : item)
      : [...categories.value, saved];
    categories.value = [...categories.value].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    notice.value = formMode.value === 'create' ? '카테고리를 만들었습니다.' : '카테고리를 수정했습니다.';
    closeForm();
  } catch (cause) {
    error.value = message(cause, 'save');
  } finally {
    busy.value = false;
  }
}
async function remove(category: CategoryDto) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await $fetch(`${props.mutateUrl}/${category.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': props.csrfToken }, body: {} });
    categories.value = categories.value.filter((item) => item.id !== category.id);
    deletingId.value = null;
    notice.value = '카테고리를 삭제했습니다.';
  } catch (cause) {
    error.value = message(cause, 'delete');
  } finally {
    busy.value = false;
  }
}
const hasInput = computed(() => formMode.value !== null);
defineExpose({ hasInput, busy });
</script>

<template>
  <section class="editor-panel" :aria-labelledby="`${idPrefix}-heading`">
    <div class="history-heading">
      <h2 :id="`${idPrefix}-heading`">{{ heading }}</h2>
      <button v-if="!loading && !loadError && !formMode" class="button button-primary" type="button" :disabled="busy" @click="openForm()">새 카테고리</button>
    </div>
    <p class="field-help">{{ description }}</p>
    <p v-if="loading" class="state" role="status">카테고리를 불러오는 중입니다.</p>
    <div v-else-if="loadError" class="state" role="alert">
      <template v-if="loadError === 'login'">세션이 만료되었습니다. <NuxtLink class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink>한 뒤 다시 시도해 주세요.</template>
      <template v-else>{{ loadError === 'missing' ? '찾을 수 없거나 관리 권한이 없습니다.' : '카테고리를 불러오지 못했습니다.' }}</template>
      <button class="link-button" type="button" @click="load()">다시 시도</button>
    </div>
    <template v-else>
      <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
      <p v-if="error && !formMode" class="form-error" role="alert">{{ error }} <NuxtLink v-if="error.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
      <form v-if="formMode" class="editor-form move-form" @submit.prevent="save">
        <h3 class="classification-form-heading">{{ formMode === 'create' ? '새 카테고리' : '카테고리 수정' }}</h3>
        <label :for="`${idPrefix}-name`">이름</label>
        <input :id="`${idPrefix}-name`" v-model="form.name" maxlength="100" :disabled="busy" required>
        <label :for="`${idPrefix}-parent`">상위 카테고리</label>
        <select :id="`${idPrefix}-parent`" v-model="form.parentId" :disabled="busy" :aria-describedby="`${idPrefix}-parent-help`">
          <option value="">최상위</option>
          <option v-for="parent in parentOptions" :key="parent.id" :value="parent.id">{{ categoryOptionLabel(parent) }}</option>
        </select>
        <p :id="`${idPrefix}-parent-help`" class="field-help">자기 자신과 하위 카테고리는 상위 후보에서 제외됩니다.</p>
        <p v-if="error" class="form-error" role="alert">{{ error }} <NuxtLink v-if="error.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
        <div class="form-actions">
          <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? '저장 중…' : formMode === 'create' ? '만들기' : '변경 저장' }}</button>
          <button class="button button-secondary" type="button" :disabled="busy" @click="closeForm">취소</button>
        </div>
      </form>
      <p v-if="!tree.length" class="state">아직 카테고리가 없습니다.</p>
      <ul v-else class="managed-books category-list">
        <li v-for="item in tree" :key="item.id" :style="{ '--depth': item.depth }">
          <div class="managed-book-content category-item">
            <p class="page-depth">깊이 {{ item.depth + 1 }}<template v-if="item.parentId"> · 상위: {{ nameOf(item.parentId) }}</template></p>
            <h3>{{ item.name }}</h3>
          </div>
          <div class="managed-book-actions">
            <button class="link-button" type="button" :disabled="busy || !!formMode" @click="openForm(item)">수정·이동</button>
            <button class="link-button danger-link" type="button" :disabled="busy || !!formMode" @click="deletingId = item.id; error = ''; notice = ''">삭제</button>
          </div>
          <div v-if="deletingId === item.id" class="delete-confirm">
            <p>카테고리 “{{ item.name }}”을(를) 삭제하시겠습니까? 하위 카테고리나 연결된 콘텐츠가 있으면 삭제되지 않습니다.</p>
            <button class="button button-danger" type="button" :disabled="busy" @click="remove(item)">{{ busy ? '삭제 중…' : '삭제 확인' }}</button>
            <button class="button button-secondary" type="button" :disabled="busy" @click="deletingId = null">취소</button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>
