<script setup lang="ts">
import { formatTitle } from '~/utils/meta';

// 제목 규칙은 여기 한 곳에서 정한다: "화면 제목 — WikiBlog", 제목이 없으면 사이트 기본 제목.
// 함수형 titleTemplate은 nuxt.config(app.head)에 직렬화할 수 없어 앱 루트에서 등록한다.
useHead({ titleTemplate: (title) => formatTitle(title) });
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
