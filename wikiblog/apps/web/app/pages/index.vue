<script setup lang="ts">
import type { PublicBookDto } from '@wikiblog/dto';
import { bookPath } from '~/utils/paths';

const { data: books, status, error, refresh } = await useFetch<PublicBookDto[]>('/api/v1/books');
if (import.meta.server && error.value) {
  const event = useRequestEvent();
  if (event) event.node.res.statusCode = 503;
}
useSeoMeta({ title: 'WikiBlog — 책으로 만나는 지식', description: '공개된 책과 문서를 읽어보세요.' });
</script>

<template>
  <div>
    <section class="hero">
      <div class="container hero-inner">
        <div>
          <p class="eyebrow">READ · LEARN · SHARE</p>
          <h1>생각을 쌓고,<br>지식을 나누는 공간.</h1>
          <p class="hero-copy">누군가의 경험이 담긴 책을 발견하고<br class="desktop-only"> 나만의 속도로 읽어보세요.</p>
          <NuxtLink class="button button-primary" to="/search">문서 검색하기 <span aria-hidden="true">→</span></NuxtLink>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="art-window"><div class="art-top"><i /><i /><i /></div><div class="art-body"><div class="art-side"><b /><b /><b /><b /></div><div class="art-lines"><b /><b /><b /><b /><b /></div></div></div>
          <span class="art-badge">지식이 이어지는 곳</span>
        </div>
      </div>
    </section>
    <section class="container library">
      <div class="section-heading">
        <div><p class="eyebrow">LIBRARY</p><h2>공개된 책</h2><p>관심 있는 주제를 골라 읽기 시작하세요.</p></div>
        <NuxtLink class="text-link" to="/search">전체 검색 <span aria-hidden="true">→</span></NuxtLink>
      </div>
      <p v-if="status === 'pending'" class="state" role="status">책을 불러오는 중입니다.</p>
      <div v-else-if="error" class="state" role="alert">책을 불러오지 못했습니다. <button class="link-button" @click="refresh()">다시 시도</button></div>
      <div v-else-if="!books?.length" class="state">아직 공개된 책이 없습니다.</div>
      <div v-else class="book-grid">
        <NuxtLink v-for="book in books" :key="book.id" class="book-card" :to="bookPath(book.handle, book.slug)">
          <div class="book-icon" aria-hidden="true">▤</div>
          <div class="book-card-content"><span class="card-owner">@{{ book.handle }}</span><h3>{{ book.title }}</h3><p>{{ book.description || '소개가 아직 작성되지 않았습니다.' }}</p></div>
          <span class="card-arrow" aria-hidden="true">↗</span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
