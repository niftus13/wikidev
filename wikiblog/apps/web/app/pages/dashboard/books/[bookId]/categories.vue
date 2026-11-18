<script setup lang="ts">
import type { BookDto, SessionResponse } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';

definePageMeta({ key: (route) => route.path });
useSeoMeta({ title: '페이지 카테고리 — WikiBlog', robots: 'noindex' });
const route = useRoute();
const bookId = String(route.params.bookId);
const session = ref<SessionResponse | null>(null);
const book = ref<BookDto | null>(null);
const loading = ref(true);
const loadError = ref('');
const categoryManager = ref<{ hasInput: boolean; busy: boolean } | null>(null);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const current = await $fetch<SessionResponse>('/api/v1/auth/session');
    const books = await $fetch<BookDto[]>('/api/v1/me/books');
    const selected = books.find((item) => item.id === bookId);
    if (!selected) throw createError({ statusCode: 404 });
    session.value = current;
    book.value = selected;
  } catch (cause) {
    loadError.value = apiErrorStatus(cause) === 401 ? 'login' : apiErrorStatus(cause) === 404 ? 'missing' : 'error';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function canLeave() {
  if (categoryManager.value?.busy) return false;
  if (categoryManager.value?.hasInput) return window.confirm('작성 중인 입력이 있습니다. 이 화면을 나가시겠습니까?');
  return true;
}
onBeforeRouteLeave(canLeave);
</script>

<template>
  <div class="container dashboard-page narrow">
    <div class="breadcrumbs">
      <NuxtLink to="/dashboard/books">내 책 관리</NuxtLink><span>/</span>
      <NuxtLink :to="`/dashboard/books/${bookId}/pages`">페이지 관리</NuxtLink><span>/</span><span>페이지 카테고리</span>
    </div>
    <p class="eyebrow dashboard-eyebrow">AUTHOR · PAGE CATEGORIES</p>
    <div class="section-heading">
      <div><h1>페이지 카테고리</h1><p v-if="book">{{ book.title }}</p></div>
    </div>
    <p v-if="loading" class="state" role="status">책 정보를 불러오는 중입니다.</p>
    <div v-else-if="loadError === 'login'" class="state">카테고리를 관리하려면 <NuxtLink class="text-link" to="/login">로그인</NuxtLink>하세요.</div>
    <div v-else-if="loadError" class="state" role="alert">
      {{ loadError === 'missing' ? '책을 찾을 수 없거나 관리 권한이 없습니다.' : '책 정보를 불러오지 못했습니다.' }}
      <button class="link-button" type="button" @click="load()">다시 시도</button>
    </div>
    <CategoryManager
      v-else-if="session && book"
      ref="categoryManager"
      :list-url="`/api/v1/me/books/${bookId}/categories`"
      :mutate-url="`/api/v1/books/${bookId}/categories`"
      :csrf-token="session.csrfToken"
      heading="이 책의 페이지 카테고리"
      description="이 책의 페이지에만 지정할 수 있는 계층형 카테고리입니다. 페이지 분류는 페이지 편집 화면에서 지정하며 재발행해야 공개됩니다."
      id-prefix="book-category"
    />
  </div>
</template>
