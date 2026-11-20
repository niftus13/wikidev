<script setup lang="ts">
import type { BookClassificationDto, BookClassificationInput, CategoryDto, TagDto } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';
import { categoryOptionLabel, categoryTree, orderedTagIds } from '~/utils/categories';

const props = defineProps<{ bookId: string; csrfToken: string }>();
const emit = defineEmits<{ close: [] }>();
const MAX_TAGS = 50;

const loading = ref(true);
const loadError = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');
const platformCategories = ref<CategoryDto[]>([]);
const spaceCategories = ref<CategoryDto[]>([]);
const tags = ref<TagDto[]>([]);
const saved = ref<BookClassificationDto | null>(null);
// platformCategoryId는 필드가 숨겨져도 불러온 값을 그대로 다시 보낸다(null로 덮어쓰지 않음).
const form = reactive<{ platformCategoryId: string | null; spaceCategoryId: string; tagIds: string[] }>({
  platformCategoryId: null, spaceCategoryId: '', tagIds: [],
});
const platformTree = computed(() => categoryTree(platformCategories.value));
const spaceTree = computed(() => categoryTree(spaceCategories.value));
const showPlatform = computed(() => platformCategories.value.length > 0);
const tooManyTags = computed(() => form.tagIds.length > MAX_TAGS);
const changed = computed(() => saved.value !== null && (
  form.platformCategoryId !== saved.value.platformCategoryId
  || (form.spaceCategoryId || null) !== saved.value.spaceCategoryId
  || orderedTagIds(form.tagIds, tags.value).join() !== orderedTagIds(saved.value.tagIds, tags.value).join()
));

function apply(value: BookClassificationDto) {
  saved.value = value;
  form.platformCategoryId = value.platformCategoryId;
  form.spaceCategoryId = value.spaceCategoryId ?? '';
  form.tagIds = [...value.tagIds];
}
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [current, platform, space, tagList] = await Promise.all([
      $fetch<BookClassificationDto>(`/api/v1/me/books/${props.bookId}/classification`),
      $fetch<CategoryDto[]>('/api/v1/categories'),
      $fetch<CategoryDto[]>('/api/v1/me/categories'),
      $fetch<TagDto[]>('/api/v1/me/tags'),
    ]);
    platformCategories.value = platform;
    spaceCategories.value = space;
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
  if (status === 404) return '책, 카테고리 또는 태그를 찾을 수 없거나 관리 권한이 없습니다. 다른 탭에서 삭제되었을 수 있으니 분류를 다시 불러와 주세요.';
  return '분류를 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
async function save() {
  if (busy.value || !saved.value || tooManyTags.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const body: BookClassificationInput = {
      platformCategoryId: form.platformCategoryId,
      spaceCategoryId: form.spaceCategoryId || null,
      tagIds: orderedTagIds(form.tagIds, tags.value),
    };
    apply(await $fetch<BookClassificationDto>(`/api/v1/books/${props.bookId}/classification`, {
      method: 'PATCH', headers: { 'X-CSRF-Token': props.csrfToken }, body,
    }));
    notice.value = '책 분류를 저장했습니다. 공개 책 화면과 검색에 바로 반영됩니다.';
  } catch (cause) {
    error.value = message(cause);
  } finally {
    busy.value = false;
  }
}
defineExpose({ changed, busy });
</script>

<template>
  <section class="classification-panel" :aria-labelledby="`book-classification-${bookId}`">
    <div class="history-heading">
      <h3 :id="`book-classification-${bookId}`">책 분류</h3>
      <button class="link-button" type="button" :disabled="busy" @click="emit('close')">닫기</button>
    </div>
    <p v-if="loading" class="state" role="status">분류를 불러오는 중입니다.</p>
    <div v-else-if="loadError" class="state" role="alert">
      <template v-if="loadError === 'login'">세션이 만료되었습니다. <NuxtLink class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink>한 뒤 다시 시도해 주세요.</template>
      <template v-else>{{ loadError === 'missing' ? '책을 찾을 수 없거나 관리 권한이 없습니다.' : '분류를 불러오지 못했습니다.' }}</template>
      <button class="link-button" type="button" @click="load()">다시 시도</button>
    </div>
    <form v-else class="editor-form" @submit.prevent="save">
      <p class="field-help"><strong>책 분류는 저장 즉시 공개됩니다.</strong> 책 정보 수정과 별도로 저장됩니다.</p>
      <template v-if="showPlatform">
        <label :for="`platform-category-${bookId}`">플랫폼 카테고리</label>
        <select :id="`platform-category-${bookId}`" v-model="form.platformCategoryId" :disabled="busy">
          <option :value="null">지정 안 함</option>
          <option v-for="item in platformTree" :key="item.id" :value="item.id">{{ categoryOptionLabel(item) }}</option>
        </select>
      </template>
      <label :for="`space-category-${bookId}`">내 카테고리</label>
      <select :id="`space-category-${bookId}`" v-model="form.spaceCategoryId" :disabled="busy" :aria-describedby="`space-category-help-${bookId}`">
        <option value="">지정 안 함</option>
        <option v-for="item in spaceTree" :key="item.id" :value="item.id">{{ categoryOptionLabel(item) }}</option>
      </select>
      <p :id="`space-category-help-${bookId}`" class="field-help">
        <template v-if="!spaceTree.length">아직 만든 카테고리가 없습니다. </template>
        <NuxtLink class="text-link" to="/dashboard/categories">카테고리 관리로 이동</NuxtLink>
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
      <p v-if="error" class="form-error" role="alert">{{ error }} <NuxtLink v-if="error.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
      <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
      <div class="form-actions">
        <button class="button button-primary" type="submit" :disabled="busy || !changed || tooManyTags">{{ busy ? '저장 중…' : '분류 저장' }}</button>
        <button class="button button-secondary" type="button" :disabled="busy" @click="load()">다시 불러오기</button>
      </div>
    </form>
  </section>
</template>
