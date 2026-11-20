<script setup lang="ts">
import type { PublicBookDto, PublicClassificationDto, PublishedPageDto, TocEntryDto } from '@wikiblog/dto';
import { bookPath, pagePath, spacePath } from '~/utils/paths';
import { markdownPlainText, renderMarkdown } from '~/utils/markdown';
import { joinTitle, metaDescription } from '~/utils/meta';

const route = useRoute();
const requestFetch = useRequestFetch();
const { data, status, error, refresh } = await useAsyncData(
  () => `page:${route.params.handle}:${route.params.slug}:${route.params.pageId}`,
  async () => {
    const book = await requestFetch<PublicBookDto>(`/api/v1/spaces/${encodeURIComponent(String(route.params.handle))}/books/${encodeURIComponent(String(route.params.slug))}`);
    const [toc, page, classification] = await Promise.all([
      requestFetch<TocEntryDto[]>(`/api/v1/books/${book.id}/toc`),
      requestFetch<PublishedPageDto>(`/api/v1/pages/${encodeURIComponent(String(route.params.pageId))}`),
      requestFetch<PublicClassificationDto>(`/api/v1/pages/${encodeURIComponent(String(route.params.pageId))}/classification`),
    ]);
    if (page.bookId !== book.id) throw createError({ statusCode: 404, statusMessage: 'Page not found' });
    return { book, toc, page, classification };
  },
);
if (import.meta.server && error.value) {
  const event = useRequestEvent();
  if (event) event.node.res.statusCode = error.value.statusCode === 404 ? 404 : 503;
}
const rendered = computed(() => data.value ? renderMarkdown(data.value.page.body) : '');
const pageIndex = computed(() => data.value?.toc.findIndex((entry) => entry.id === data.value?.page.id) ?? -1);
const previous = computed(() => pageIndex.value > 0 ? data.value?.toc[pageIndex.value - 1] : undefined);
const next = computed(() => pageIndex.value >= 0 ? data.value?.toc[pageIndex.value + 1] : undefined);
usePageMeta({
  title: () => data.value ? joinTitle(data.value.page.title, data.value.book.title) : '페이지',
  // 본문 앞부분을 텍스트로만 쓴다(렌더링한 HTML이 아니라 Markdown 토큰의 글자).
  description: () => data.value
    ? metaDescription(markdownPlainText(data.value.page.body), `「${data.value.book.title}」의 페이지 「${data.value.page.title}」입니다.`)
    : undefined,
  noindex: () => Boolean(error.value),
  type: 'article',
});
</script>

<template>
  <div v-if="status === 'pending'" class="container state" role="status">페이지를 불러오는 중입니다.</div>
  <div v-else-if="error || !data" class="container state" role="alert">
    페이지를 찾을 수 없거나 불러오지 못했습니다. <button class="link-button" @click="refresh()">다시 시도</button>
  </div>
  <ReaderShell v-else :book="data.book" :toc="data.toc" :current-id="data.page.id">
    <div class="breadcrumbs"><NuxtLink to="/">책 둘러보기</NuxtLink><span>/</span><NuxtLink :to="spacePath(data.book.handle)">@{{ data.book.handle }}</NuxtLink><span>/</span><NuxtLink :to="bookPath(data.book.handle, data.book.slug)">{{ data.book.title }}</NuxtLink><span>/</span><span>{{ data.page.title }}</span></div>
    <article class="article">
      <p class="eyebrow">PAGE</p>
      <h1>{{ data.page.title }}</h1>
      <ClassificationLinks :classification="data.classification" />
      <div class="divider" />
      <div class="markdown-body" v-html="rendered" />
    </article>
    <nav class="page-navigation" aria-label="이전 및 다음 페이지">
      <NuxtLink v-if="previous" class="page-nav-link" :to="pagePath(data.book.handle, data.book.slug, previous.id)"><small>← 이전</small><strong>{{ previous.title }}</strong></NuxtLink>
      <span v-else />
      <NuxtLink v-if="next" class="page-nav-link next" :to="pagePath(data.book.handle, data.book.slug, next.id)"><small>다음 →</small><strong>{{ next.title }}</strong></NuxtLink>
    </nav>
  </ReaderShell>
</template>
