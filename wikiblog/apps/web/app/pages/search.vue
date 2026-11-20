<script setup lang="ts">
import type { PublicCategoryDto, SearchResultDto } from '@wikiblog/dto';
import { BookOpen, FileText, LoaderCircle, Search, SearchX, Tag, X } from '@lucide/vue';
import { bookPath, pagePath, spacePath } from '~/utils/paths';
import { avatarInitial, normalizeSearchQuery, sameSearchQuery, SEARCH_DEBOUNCE_MS, SEARCH_RESULT_LIMIT } from '~/utils/search';

const route = useRoute();
const router = useRouter();
const current = computed(() => normalizeSearchQuery(route.query));
const query = computed(() => current.value.q ?? '');
const category = computed(() => current.value.categoryId ?? '');
const tag = computed(() => current.value.tag ?? '');
const hasSearch = computed(() => Object.keys(current.value).length > 0);
const searchInput = ref(query.value);
const categoryInput = ref(category.value);
const tagInput = ref(tag.value);
// 입력 중에는 URL이 따라와도 입력값을 덮지 않는다(뒤로 가기 등 외부 변경만 반영).
watch(query, (value) => { if (value !== searchInput.value.trim()) searchInput.value = value; });
watch(category, (value) => { categoryInput.value = value; });
watch(tag, (value) => { tagInput.value = value; });

const requestFetch = useRequestFetch();
const { data: categories, error: categoriesError, refresh: refreshCategories } = await useFetch<PublicCategoryDto[]>('/api/v1/categories/discover');
const { data: results, status, error, refresh } = await useAsyncData(
  () => `search:${query.value}:${category.value}:${tag.value}`,
  () => hasSearch.value ? requestFetch<SearchResultDto[]>('/api/v1/search', { query: current.value }) : Promise.resolve([]),
);
if (import.meta.server && error.value) {
  const event = useRequestEvent();
  if (event) event.node.res.statusCode = error.value.statusCode === 400 ? 400 : 503;
}

// 새 검색을 불러오는 동안 이전 결과를 흐리게 유지해 입력할 때마다 목록이 사라지지 않게 한다.
const shown = ref<SearchResultDto[]>(results.value ?? []);
watch([results, status], () => { if (status.value === 'success') shown.value = results.value ?? []; });
const loading = computed(() => hasSearch.value && status.value === 'pending');
const firstLoad = computed(() => loading.value && !shown.value.length);

function apply() {
  const next = normalizeSearchQuery({ q: searchInput.value, categoryId: categoryInput.value, tag: tagInput.value });
  if (sameSearchQuery(next, current.value)) return;
  // 검색어 입력은 기록을 쌓지 않도록 현재 기록을 바꾼다.
  return router.replace({ path: '/search', query: next });
}

let timer: ReturnType<typeof setTimeout> | undefined;
const composing = ref(false);
function cancelScheduled() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
function schedule() {
  cancelScheduled();
  // 한글 등 IME 조합 중에는 자동 검색하지 않는다. 조합이 끝나면(compositionend) 다시 예약한다.
  if (composing.value) return;
  timer = setTimeout(() => { timer = undefined; apply(); }, SEARCH_DEBOUNCE_MS);
}
function onCompositionEnd() {
  composing.value = false;
  schedule();
}
function submitNow() {
  cancelScheduled();
  return apply();
}
const searchField = ref<HTMLInputElement | null>(null);
function clearSearch() {
  searchInput.value = '';
  searchField.value?.focus();
  return submitNow();
}
onMounted(() => { if (!query.value) searchField.value?.focus(); });
onBeforeUnmount(cancelScheduled);

usePageMeta({
  title: () => query.value ? `"${query.value}" 검색` : '검색',
  description: () => query.value ? `WikiBlog에서 "${query.value}"(으)로 찾은 공개 책과 페이지입니다.` : '공개된 책과 페이지를 제목·본문·카테고리·태그로 검색하세요.',
});
</script>

<template>
  <div class="container search-page narrow">
    <h1 class="sr-only">지식 검색</h1>
    <form role="search" aria-label="책과 페이지 검색" @submit.prevent="submitNow">
      <label class="sr-only" for="search-query">검색어</label>
      <div class="group relative">
        <Search class="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-[#8a9aab] max-sm:left-3.5 max-sm:size-5" aria-hidden="true" />
        <input
          id="search-query" ref="searchField" v-model="searchInput" type="search" enterkeyhint="search"
          placeholder="책과 페이지를 검색하세요" maxlength="200" autocomplete="off" aria-describedby="search-help"
          class="block h-16 w-full min-w-0 rounded-card border border-input bg-white pr-14 pl-14 text-[22px] font-semibold tracking-[-.02em] text-ink shadow-[0_4px_16px_#263e590a] placeholder:font-normal placeholder:text-[#9aa7b6] hover:border-[#b7c6d8] focus:border-accent max-sm:h-14 max-sm:pr-12 max-sm:pl-11 max-sm:text-lg [&::-webkit-search-cancel-button]:appearance-none"
          @input="schedule" @compositionstart="composing = true" @compositionend="onCompositionEnd"
        >
        <button
          v-if="searchInput" type="button" aria-label="검색어 지우기"
          class="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full border-0 bg-transparent text-[#6b7b8e] hover:bg-soft hover:text-ink max-sm:right-2"
          @click="clearSearch"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <p id="search-help" class="mt-2 mb-0 text-[13px] text-muted">입력하면 자동으로 검색합니다. 공개된 책 제목과 발행된 페이지의 제목·본문을 찾습니다.</p>
    </form>

    <div class="mt-5 flex flex-wrap items-center gap-2.5">
      <label class="sr-only" for="category-filter">카테고리</label>
      <select
        id="category-filter" v-model="categoryInput"
        class="h-control max-w-full min-w-0 rounded-control border border-input bg-white px-3 text-sm text-ink hover:border-[#b7c6d8] max-sm:w-full"
        @change="submitNow"
      >
        <option value="">전체 카테고리</option>
        <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.scopeLabel ? `${item.scopeLabel} · ` : '플랫폼 · ' }}{{ item.name }}</option>
      </select>
      <form class="flex min-w-0 flex-[1_1_220px] items-center gap-2" aria-label="태그 필터" @submit.prevent="submitNow">
        <label class="sr-only" for="tag-filter">태그</label>
        <div class="relative min-w-0 flex-1">
          <Tag class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8a9aab]" aria-hidden="true" />
          <input
            id="tag-filter" v-model="tagInput" type="text" placeholder="태그로 좁히기" maxlength="101"
            class="block h-control w-full min-w-0 rounded-control border border-input bg-white pr-3 pl-9 text-sm text-ink placeholder:text-[#9aa7b6] hover:border-[#b7c6d8]"
          >
        </div>
        <button class="button button-secondary" type="submit">태그 적용</button>
      </form>
    </div>
    <p v-if="categoriesError" class="state" role="alert">카테고리를 불러오지 못했습니다. <button class="link-button" type="button" @click="refreshCategories()">다시 시도</button></p>

    <section class="mt-10 max-sm:mt-8" aria-labelledby="results-heading">
      <h2 id="results-heading" class="sr-only">검색 결과</h2>
      <div v-if="!hasSearch" class="rounded-card border border-dashed border-line bg-soft px-6 py-12 text-center">
        <Search class="mx-auto mb-3 size-8 text-[#a9b5c3]" aria-hidden="true" />
        <p class="m-0 font-bold">무엇을 찾고 있나요?</p>
        <p class="mt-1 mb-0 text-sm text-muted">검색어를 입력하거나 카테고리·태그를 선택하면 공개된 책과 페이지를 찾을 수 있습니다.</p>
      </div>
      <p v-else-if="firstLoad" class="state flex items-center gap-2" role="status">
        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />검색 중입니다.
      </p>
      <div v-else-if="error && !loading" class="state" role="alert">
        검색하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.
        <button class="link-button" type="button" @click="refresh()">다시 시도</button>
      </div>
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3" role="status">
          <p class="m-0 text-[15px] text-[#3f5672]">
            총 <strong class="text-ink">{{ shown.length }}</strong>개의 결과<span v-if="shown.length >= SEARCH_RESULT_LIMIT"> (최대 {{ SEARCH_RESULT_LIMIT }}개까지 표시)</span>
          </p>
          <span v-if="loading" class="inline-flex items-center gap-1.5 text-xs text-muted">
            <LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />검색 중…
          </span>
        </div>
        <p v-if="shown.length >= SEARCH_RESULT_LIMIT" class="mt-3 mb-0 text-[13px] text-muted">
          결과가 많아 앞의 {{ SEARCH_RESULT_LIMIT }}개만 보여 줍니다. 검색어를 더 구체적으로 입력하거나 필터를 사용해 보세요.
        </p>
        <div v-if="!shown.length" class="px-6 py-14 text-center">
          <SearchX class="mx-auto mb-3 size-8 text-[#a9b5c3]" aria-hidden="true" />
          <p class="m-0 font-bold">검색 조건에 맞는 결과가 없습니다.</p>
          <p class="mt-1 mb-0 text-sm text-muted">다른 검색어를 입력하거나 필터를 해제해 보세요.</p>
        </div>
        <ul v-else class="m-0 list-none p-0 transition-opacity" :class="{ 'opacity-60': loading }" :aria-busy="loading">
          <li v-for="result in shown" :key="`${result.type}:${result.id}`" class="group relative border-b border-line py-6">
            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
              <NuxtLink class="owner-link inline-flex items-center gap-2 font-semibold text-[#3f5672]" :to="spacePath(result.handle)">
                <span class="avatar size-6 text-[11px]" aria-hidden="true">{{ avatarInitial(result.handle) }}</span>@{{ result.handle }}
              </NuxtLink>
              <span
                class="inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-bold"
                :class="result.type === 'book' ? 'border-[#d7e5fa] bg-accent-soft text-[#255dbc]' : 'border-line bg-soft text-[#536479]'"
              >
                <BookOpen v-if="result.type === 'book'" class="size-3" aria-hidden="true" />
                <FileText v-else class="size-3" aria-hidden="true" />
                {{ result.type === 'book' ? '책' : '페이지' }}
              </span>
            </div>
            <h3 class="mt-2.5 mb-1.5 text-lg leading-snug font-bold tracking-[-.02em] [overflow-wrap:anywhere] group-hover:text-accent">
              <NuxtLink class="card-link" :to="result.type === 'book' ? bookPath(result.handle, result.bookSlug) : pagePath(result.handle, result.bookSlug, result.id)">{{ result.title }}</NuxtLink>
            </h3>
            <p v-if="result.excerpt" class="m-0 line-clamp-3 text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{{ result.excerpt }}</p>
            <p v-if="result.type === 'page'" class="mt-2 mb-0 inline-flex max-w-full items-center gap-1.5 text-xs text-[#7a8a9c]">
              <BookOpen class="size-3.5 shrink-0" aria-hidden="true" /><span class="sr-only">책:</span><span class="truncate">{{ result.bookTitle }}</span>
            </p>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>
