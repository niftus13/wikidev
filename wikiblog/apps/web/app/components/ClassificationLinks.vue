<script setup lang="ts">
import type { PublicClassificationDto } from '@wikiblog/dto';
defineProps<{ classification: PublicClassificationDto }>();
</script>

<template>
  <nav v-if="classification.categories.length || classification.tags.length" class="classification-links" aria-label="카테고리와 태그">
    <NuxtLink v-for="category in classification.categories" :key="category.id" :to="{ path: '/search', query: { categoryId: category.id } }">{{ category.name }}</NuxtLink>
    <NuxtLink v-for="tag in classification.tags" :key="tag.id" :to="{ path: '/search', query: { tag: tag.name } }">#{{ tag.name }}</NuxtLink>
  </nav>
</template>
