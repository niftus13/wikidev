<script setup lang="ts">
import type { CategoryDto, PageClassificationDto, PageClassificationInput, TagDto } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';
import { categoryOptionLabel, categoryTree, orderedTagIds } from '~/utils/categories';

const props = defineProps<{
  pageId: string;
  bookId: string;
  csrfToken: string;
  /** 편집 화면이 가진 현재 draft revision. 저장 요청에 그대로 사용한다. */
  revision: number;
  /** 제목·본문에 저장하지 않은 변경이 있는지 */
  dirty: boolean;
  /** 편집 화면과 공유하는 요청 진행 상태 */
  busy: boolean;
}>();
const emit = defineEmits<{ 'update:busy': [value: boolean]; saved: [value: PageClassificationDto]; reloadDraft: [] }>();
const MAX_TAGS = 50;

const loading = ref(true);
const loadError = ref('');
const error = ref('');
const notice = ref('');
const conflict = ref(false);
const categories = ref<CategoryDto[]>([]);
const tags = ref<TagDto[]>([]);
const saved = ref<{ categoryId: string | null; tagIds: string[] } | null>(null);
const form = reactive<{ categoryId: string; tagIds: string[] }>({ categoryId: '', tagIds: [] });
const tree = computed(() => categoryTree(categories.value));
const tooManyTags = computed(() => form.tagIds.length > MAX_TAGS);
const changed = computed(() => saved.value !== null && (
  (form.categoryId || null) !== saved.value.categoryId
  || orderedTagIds(form.tagIds, tags.value).join() !== orderedTagIds(saved.value.tagIds, tags.value).join()
));
// 최신 초안을 다시 불러와 revision이 바뀌면 충돌 상태를 해제한다. 선택은 유지한다.
watch(() => props.revision, () => { conflict.value = false; });

function apply(value: { categoryId: string | null; tagIds: string[] }) {
  saved.value = { categoryId: value.categoryId, tagIds: [...value.tagIds] };
  form.categoryId = value.categoryId ?? '';
  form.tagIds = [...value.tagIds];
}
async function load() {
  loading.value = true;
  loadError.value = '';
  error.value = '';
  conflict.value = false;
  try {
    const [current, bookCategories, tagList] = await Promise.all([
      $fetch<PageClassificationDto>(`/api/v1/me/pages/${props.pageId}/classification`),
      $fetch<CategoryDto[]>(`/api/v1/me/books/${props.bookId}/categories`),
      $fetch<TagDto[]>('/api/v1/me/tags'),
    ]);
    categories.value = bookCategories;
    tags.value = tagList;
    apply(current);
  } catch (cause) {
    const status = apiErrorStatus(cause);
    loadError.value = status === 401 ? 'login' : status === 404 ? 'missing' : 'error';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function message(cause: unknown) {
  const status = apiErrorStatus(cause);
  if (status === 400) return '선택한 분류를 확인해 주세요. 태그는 최대 50개까지 지정할 수 있습니다.';
  if (status === 401) return '세션이 만료되었습니다. 다른 탭에서 다시 로그인한 뒤 다시 저장해 주세요. 선택은 유지됩니다.';
  if (status === 403) return '인증 정보가 변경되었거나 요청이 거부되었습니다. 새로고침 후 다시 시도해 주세요.';
  if (status === 404) return '페이지, 카테고리 또는 태그를 찾을 수 없거나 관리 권한이 없습니다. 다른 탭에서 삭제되었을 수 있으니 분류를 다시 불러와 주세요.';
  if (status === 409) return '다른 곳에서 초안이 변경되어 분류를 저장하지 못했습니다. 선택한 분류는 유지됩니다. 최신 초안을 다시 불러온 뒤 다시 저장해 주세요.';
  return '분류를 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
async function save() {
  if (props.busy || props.dirty || conflict.value || !saved.value || tooManyTags.value) return;
  emit('update:busy', true);
  error.value = '';
  notice.value = '';
  try {
    const body: PageClassificationInput = {
      revision: props.revision,
      categoryId: form.categoryId || null,
      tagIds: orderedTagIds(form.tagIds, tags.value),
    };
    const result = await $fetch<PageClassificationDto>(`/api/v1/pages/${props.pageId}/classification`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': props.csrfToken }, body,
    });
    apply(result);
    emit('saved', result);
    notice.value = `분류를 초안에 저장했습니다 (revision ${result.revision}). 공개 페이지에 반영하려면 다시 발행하세요.`;
  } catch (cause) {
    if (apiErrorStatus(cause) === 409) conflict.value = true;
    error.value = message(cause);
  } finally {
    emit('update:busy', false);
  }
}
defineExpose({ changed, reload: load });
</script>

<template>
  <section class="editor-panel" aria-labelledby="page-classification-heading">
    <h2 id="page-classification-heading">분류</h2>
    <p class="field-help">페이지 분류는 초안에 새 이력(revision)으로 저장되며, <strong>다시 발행해야 공개됩니다.</strong> 본문 저장과 별도로 저장합니다.</p>
    <p v-if="loading" class="state" role="status">분류를 불러오는 중입니다.</p>
    <div v-else-if="loadError" class="state" role="alert">
      <template v-if="loadError === 'login'">세션이 만료되었습니다. <NuxtLink class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink>한 뒤 다시 시도해 주세요.</template>
      <template v-else>{{ loadError === 'missing' ? '페이지를 찾을 수 없거나 관리 권한이 없습니다.' : '분류를 불러오지 못했습니다.' }}</template>
      <button class="link-button" type="button" @click="load()">다시 시도</button>
    </div>
    <form v-else class="editor-form" @submit.prevent="save">
      <label for="page-category">페이지 카테고리</label>
      <select id="page-category" v-model="form.categoryId" :disabled="busy" aria-describedby="page-category-help">
        <option value="">지정 안 함</option>
        <option v-for="item in tree" :key="item.id" :value="item.id">{{ categoryOptionLabel(item) }}</option>
      </select>
      <p id="page-category-help" class="field-help">
        <template v-if="!tree.length">이 책에는 아직 페이지 카테고리가 없습니다. </template>
        <NuxtLink class="text-link" :to="`/dashboard/books/${bookId}/categories`">페이지 카테고리 관리로 이동</NuxtLink>
      </p>
      <fieldset class="tag-choices" :disabled="busy">
        <legend>태그 <span class="field-help">({{ form.tagIds.length }} / {{ MAX_TAGS }})</span></legend>
        <p v-if="!tags.length" class="field-help">아직 만든 태그가 없습니다.</p>
        <label v-for="tag in tags" :key="tag.id" class="tag-choice">
          <input v-model="form.tagIds" type="checkbox" :value="tag.id">
          <span>#{{ tag.name }}</span>
        </label>
      </fieldset>
      <p class="field-help">기존 태그 중에서 고릅니다. <NuxtLink class="text-link" to="/dashboard/categories">태그 관리로 이동</NuxtLink></p>
      <p v-if="tooManyTags" class="form-error" role="alert">태그는 최대 {{ MAX_TAGS }}개까지 지정할 수 있습니다.</p>
      <p v-if="dirty" class="field-help">제목·본문에 저장하지 않은 변경이 있습니다. 분류를 저장하려면 먼저 초안을 저장하세요.</p>
      <p v-if="error" class="form-error" role="alert">{{ error }} <NuxtLink v-if="error.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
      <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
      <div class="form-actions">
        <button class="button button-primary" type="submit" :disabled="busy || dirty || conflict || !changed || tooManyTags">{{ busy ? '처리 중…' : '분류 저장' }}</button>
        <button v-if="conflict" class="button button-secondary" type="button" :disabled="busy || dirty" @click="emit('reloadDraft')">최신 초안 다시 불러오기</button>
        <button v-else class="button button-secondary" type="button" :disabled="busy" @click="load()">분류 다시 불러오기</button>
      </div>
      <p v-if="changed" class="field-help">저장하지 않은 분류는 발행에 포함되지 않습니다.</p>
    </form>
  </section>
</template>
