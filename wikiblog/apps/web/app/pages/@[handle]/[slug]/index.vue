<script setup lang="ts">
import type { PublicBookDto, PublicClassificationDto, TocEntryDto } from '@wikiblog/dto';
import { pagePath, spacePath } from '~/utils/paths';
import { metaDescription } from '~/utils/meta';

const route = useRoute();
const requestFetch = useRequestFetch();
const { data, status, error, refresh } = await useAsyncData(
  () => `book:${route.params.handle}:${route.params.slug}`,
  async () => {
    const book = await requestFetch<PublicBookDto>(`/api/v1/spaces/${encodeURIComponent(String(route.params.handle))}/books/${encodeURIComponent(String(route.params.slug))}`);
    const [toc, classification] = await Promise.all([
      requestFetch<TocEntryDto[]>(`/api/v1/books/${book.id}/toc`),
      requestFetch<PublicClassificationDto>(`/api/v1/books/${book.id}/classification`),
    ]);
    return { book, toc, classification };
  },
);
if (import.meta.server && error.value) {
  const event = useRequestEvent();
  if (event) event.node.res.statusCode = error.value.statusCode === 404 ? 404 : 503;
}
usePageMeta({
  title: () => data.value?.book.title ?? '책',
  description: () => data.value
    ? metaDescription(data.value.book.description, `@${data.value.book.handle}의 책 「${data.value.book.title}」을 읽어보세요.`)
    : undefined,
  noindex: () => Boolean(error.value),
});
</script>

<template>
  <div v-if="status === 'pending'" class="container state" role="status">책을 불러오는 중입니다.</div>
  <div v-else-if="error || !data" class="container state" role="alert">
    책을 찾을 수 없거나 불러오지 못했습니다. <button class="link-button" @click="refresh()">다시 시도</button>
  </div>
  <ReaderShell v-else :book="data.book" :toc="data.toc">
    <div class="breadcrumbs"><NuxtLink to="/">책 둘러보기</NuxtLink><span>/</span><NuxtLink :to="spacePath(data.book.handle)">@{{ data.book.handle }}</NuxtLink><span>/</span><span>{{ data.book.title }}</span></div>
    <article class="article">
      <p class="eyebrow">ABOUT THIS BOOK</p>
      <h1>{{ data.book.title }}</h1>
      <p class="book-byline"><NuxtLink class="owner-link" :to="spacePath(data.book.handle)">@{{ data.book.handle }}</NuxtLink>의 책</p>
      <ClassificationLinks :classification="data.classification" />
      <div class="divider" />
      <h2>이 책에 대하여</h2>
      <p class="book-description">{{ data.book.description || '아직 책 소개가 없습니다.' }}</p>
      <NuxtLink v-if="data.toc[0]" class="button button-primary start-reading" :to="pagePath(data.book.handle, data.book.slug, data.toc[0].id)">첫 페이지 읽기 <span aria-hidden="true">→</span></NuxtLink>
      <p v-else class="state">아직 발행된 페이지가 없습니다.</p>
    </article>
  </ReaderShell>
</template>
