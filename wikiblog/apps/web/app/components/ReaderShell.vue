<script setup lang="ts">
import type { PublicBookDto, TocEntryDto } from '@wikiblog/dto';
import { bookPath, pagePath } from '~/utils/paths';

const props = defineProps<{ book: PublicBookDto; toc: TocEntryDto[]; currentId?: string }>();
const depths = computed(() => {
  const result = new Map<string, number>();
  for (const entry of props.toc) result.set(entry.id, entry.parentId ? (result.get(entry.parentId) ?? 0) + 1 : 0);
  return result;
});
</script>

<template>
  <div class="reader">
    <aside class="reader-sidebar" aria-label="책 목차">
      <NuxtLink class="sidebar-book" :to="bookPath(book.handle, book.slug)">
        <span class="eyebrow">BOOK</span>
        <strong>{{ book.title }}</strong>
        <span class="sidebar-author">@{{ book.handle }}</span>
      </NuxtLink>
      <div class="sidebar-label">목차 <span>{{ toc.length }}</span></div>
      <nav v-if="toc.length" aria-label="페이지 목차">
        <ul class="toc-list">
          <li v-for="entry in toc" :key="entry.id">
            <NuxtLink
              :to="pagePath(book.handle, book.slug, entry.id)"
              :class="{ active: entry.id === currentId }"
              :aria-current="entry.id === currentId ? 'page' : undefined"
              :style="{ paddingLeft: `${12 + Math.min(depths.get(entry.id) ?? 0, 6) * 16}px` }"
            >{{ entry.title }}</NuxtLink>
          </li>
        </ul>
      </nav>
      <p v-else class="sidebar-empty">아직 발행된 페이지가 없습니다.</p>
    </aside>
    <div class="reader-content"><slot /></div>
  </div>
</template>
