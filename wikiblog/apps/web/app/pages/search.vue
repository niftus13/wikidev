<script setup lang="ts">
import type { PublicCategoryDto, SearchResultDto } from '@wikiblog/dto';
import { bookPath, pagePath, spacePath } from '~/utils/paths';

const route = useRoute();
const query = computed(() => typeof route.query.q === 'string' ? route.query.q.trim() : '');
const category = computed(() => typeof route.query.categoryId === 'string' ? route.query.categoryId : '');
const tag = computed(() => typeof route.query.tag === 'string' ? route.query.tag.trim() : '');
const hasSearch = computed(() => Boolean(query.value || category.value || tag.value));
const searchInput = ref(query.value);
const categoryInput = ref(category.value);
const tagInput = ref(tag.value);
watch(query, (value) => { searchInput.value = value; });
watch(category, (value) => { categoryInput.value = value; });
watch(tag, (value) => { tagInput.value = value; });
const requestFetch = useRequestFetch();
const { data: categories, error: categoriesError, refresh: refreshCategories } = await useFetch<PublicCategoryDto[]>('/api/v1/categories/discover');
const { data: results, status, error, refresh } = await useAsyncData(
  () => `search:${query.value}:${category.value}:${tag.value}`,
  () => hasSearch.value ? requestFetch<SearchResultDto[]>('/api/v1/search', {
    query: { ...(query.value ? { q: query.value } : {}), ...(category.value ? { categoryId: category.value } : {}), ...(tag.value ? { tag: tag.value } : {}) },
  }) : Promise.resolve([]),
);
if (import.meta.server && error.value) {
  const event = useRequestEvent();
  if (event) event.node.res.statusCode = error.value.statusCode === 400 ? 400 : 503;
}
function search() {
  const q = searchInput.value.trim();
  const selectedTag = tagInput.value.trim();
  return navigateTo({ path: '/search', query: {
    ...(q ? { q } : {}), ...(categoryInput.value ? { categoryId: categoryInput.value } : {}), ...(selectedTag ? { tag: selectedTag } : {}),
  } });
}
useSeoMeta({ title: '검색 — WikiBlog', description: '공개된 책과 페이지를 검색하세요.' });
</script>

<template>
  <div class="container search-page narrow">
    <p class="eyebrow">DISCOVER</p>
    <h1>지식 검색</h1>
    <p class="page-intro">공개된 책과 발행된 페이지에서 찾아보세요.</p>
    <form class="search-form" role="search" @submit.prevent="search">
      <label class="sr-only" for="search-query">검색어</label>
      <input id="search-query" v-model="searchInput" type="search" placeholder="검색어를 입력하세요" maxlength="200">
      <button class="button button-primary" type="submit">검색</button>
    </form>
    <div class="search-filters">
      <label for="category-filter">카테고리</label>
      <select id="category-filter" v-model="categoryInput" form="classification-search" @change="search">
        <option value="">전체 카테고리</option>
        <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.scopeLabel ? `${item.scopeLabel} · ` : '플랫폼 · ' }}{{ item.name }}</option>
      </select>
      <form id="classification-search" class="tag-filter" @submit.prevent="search">
        <label for="tag-filter">태그</label>
        <input id="tag-filter" v-model="tagInput" type="text" placeholder="#태그" maxlength="101">
        <button class="button button-primary" type="submit">필터 적용</button>
      </form>
    </div>
    <p v-if="categoriesError" class="state" role="alert">카테고리를 불러오지 못했습니다. <button class="link-button" @click="refreshCategories()">다시 시도</button></p>
    <p v-if="!hasSearch" class="state">검색어 또는 필터를 선택하면 책과 페이지를 찾을 수 있습니다.</p>
    <p v-else-if="status === 'pending'" class="state" role="status">검색 중입니다.</p>
    <div v-else-if="error" class="state" role="alert">검색하지 못했습니다. <button class="link-button" @click="refresh()">다시 시도</button></div>
    <div v-else>
      <div class="results-heading"><h2>검색 결과</h2><span>최대 50개</span></div>
      <p v-if="!results?.length" class="state">검색 조건에 맞는 결과가 없습니다.</p>
      <ul v-else class="results">
        <li v-for="result in results" :key="`${result.type}:${result.id}`">
          <div class="result-meta">{{ result.type === 'book' ? '책' : '페이지' }} <span>·</span> <NuxtLink class="owner-link" :to="spacePath(result.handle)">@{{ result.handle }}</NuxtLink> <span v-if="result.type === 'page'"> · {{ result.bookTitle }}</span></div>
          <h3><NuxtLink class="card-link" :to="result.type === 'book' ? bookPath(result.handle, result.bookSlug) : pagePath(result.handle, result.bookSlug, result.id)">{{ result.title }} <span aria-hidden="true">↗</span></NuxtLink></h3>
          <p v-if="result.excerpt">{{ result.excerpt }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>
