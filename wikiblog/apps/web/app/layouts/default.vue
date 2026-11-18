<script setup lang="ts">
const query = ref('');
const route = useRoute();
watch(() => route.query.q, (value) => { query.value = typeof value === 'string' ? value : ''; }, { immediate: true });

function search() {
  const value = query.value.trim();
  if (value) return navigateTo({ path: '/search', query: { q: value } });
}
</script>

<template>
  <div class="app">
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <header class="site-header">
      <div class="header-inner">
        <NuxtLink class="brand" to="/" aria-label="WikiBlog 홈">
          <span class="brand-mark" aria-hidden="true">W</span><span>WikiBlog</span>
        </NuxtLink>
        <nav class="header-nav" aria-label="주 메뉴">
          <NuxtLink to="/">책 둘러보기</NuxtLink>
          <NuxtLink to="/search">검색</NuxtLink>
          <NuxtLink to="/dashboard/books">내 책 관리</NuxtLink>
        </nav>
        <form class="header-search" role="search" @submit.prevent="search">
          <label class="sr-only" for="header-query">책과 페이지 검색</label>
          <span aria-hidden="true">⌕</span>
          <input id="header-query" v-model="query" type="search" placeholder="책과 페이지 검색" maxlength="200">
          <button type="submit">검색</button>
        </form>
      </div>
    </header>
    <main id="main" class="main-content"><slot /></main>
    <footer class="site-footer"><div>WikiBlog <span>·</span> 함께 읽고, 지식을 쌓는 공간</div></footer>
  </div>
</template>
