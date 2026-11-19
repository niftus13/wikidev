<script setup lang="ts">
import { ArrowUpRight, BookOpen } from '@lucide/vue';
import type { PublicBookDto, SpaceDto } from '@wikiblog/dto';
import { normalizeHandle } from '@wikiblog/shared';
import { bookPath, spacePath } from '~/utils/paths';
import { descriptionExcerpt } from '~/utils/space';

definePageMeta({
  // 공간 API는 handle을 정규화하므로 같은 공간의 URL을 소문자 하나로 고정한다.
  middleware: [(to) => {
    const handle = String(to.params.handle);
    const normalized = normalizeHandle(handle);
    if (normalized && normalized !== handle) return navigateTo(spacePath(normalized), { redirectCode: 301 });
  }],
});

const route = useRoute();
const requestFetch = useRequestFetch();
const { data, status, error, refresh } = await useAsyncData(
  () => `space:${route.params.handle}`,
  async () => {
    const handle = encodeURIComponent(String(route.params.handle));
    const [space, books] = await Promise.all([
      requestFetch<SpaceDto>(`/api/v1/spaces/${handle}`),
      requestFetch<PublicBookDto[]>(`/api/v1/spaces/${handle}/books`),
    ]);
    return { space, books };
  },
);
if (import.meta.server && error.value) {
  const event = useRequestEvent();
  if (event) event.node.res.statusCode = error.value.statusCode === 404 ? 404 : 503;
}
const notFound = computed(() => error.value?.statusCode === 404);
useSeoMeta({
  title: () => data.value ? `@${data.value.space.handle} — WikiBlog` : '사용자 공간 — WikiBlog',
  description: () => (data.value && descriptionExcerpt(data.value.space.description))
    || (data.value ? `@${data.value.space.handle}의 공개 책을 읽어보세요.` : 'WikiBlog 사용자 공간'),
  robots: () => error.value ? 'noindex' : undefined,
});

// 소유자 링크는 편의 기능일 뿐이다. 서버 렌더링 HTML에 넣지 않고 브라우저에서 헤더와 같은 세션 상태로 비교한다.
const currentUser = useCurrentUser();
onMounted(() => { if (currentUser.status.value === 'unknown') currentUser.refresh(); });
const isOwner = computed(() => !!data.value && currentUser.handle.value === data.value.space.handle);
</script>

<template>
  <div class="container space-page">
    <p v-if="status === 'pending'" class="state" role="status">공간을 불러오는 중입니다.</p>
    <div v-else-if="notFound" class="state" role="alert">
      <h1 class="space-missing">공간을 찾을 수 없습니다.</h1>
      <p>주소가 올바른지 확인하세요. <NuxtLink class="text-link" to="/">책 둘러보기</NuxtLink></p>
    </div>
    <div v-else-if="error || !data" class="state" role="alert">
      공간을 불러오지 못했습니다. <button class="link-button" type="button" @click="refresh()">다시 시도</button>
    </div>
    <template v-else>
      <div class="breadcrumbs"><NuxtLink to="/">책 둘러보기</NuxtLink><span>/</span><span>@{{ data.space.handle }}</span></div>
      <header class="space-header">
        <p class="eyebrow">SPACE</p>
        <div class="section-heading">
          <h1>@{{ data.space.handle }}</h1>
          <div v-if="isOwner" class="space-owner-actions">
            <NuxtLink class="text-link" to="/dashboard/books?space=edit">소개 편집</NuxtLink>
            <NuxtLink class="text-link" to="/dashboard/books">내 책 관리</NuxtLink>
          </div>
        </div>
        <p v-if="data.space.description" class="space-description">{{ data.space.description }}</p>
        <p v-else class="space-description empty">소개가 아직 작성되지 않았습니다.</p>
      </header>
      <section class="space-library" aria-labelledby="space-books-heading">
        <div class="section-heading">
          <div><p class="eyebrow">BOOKS</p><h2 id="space-books-heading">공개된 책</h2></div>
          <span v-if="data.books.length" class="field-help">{{ data.books.length }}권</span>
        </div>
        <p v-if="!data.books.length" class="state">아직 공개된 책이 없습니다.</p>
        <div v-else class="book-grid">
          <article v-for="book in data.books" :key="book.id" class="book-card">
            <div class="book-icon" aria-hidden="true"><BookOpen class="size-5" /></div>
            <div class="book-card-content">
              <h3><NuxtLink class="card-link" :to="bookPath(book.handle, book.slug)">{{ book.title }}</NuxtLink></h3>
              <p>{{ book.description || '소개가 아직 작성되지 않았습니다.' }}</p>
            </div>
            <ArrowUpRight class="card-arrow size-4 shrink-0" aria-hidden="true" />
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
