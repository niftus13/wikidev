<script setup lang="ts">
import type { PublicBookDto, TocEntryDto } from '@wikiblog/dto';
import { bookPath, pagePath, spacePath } from '~/utils/paths';

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
      <div class="sidebar-book">
        <NuxtLink class="sidebar-book-link" :to="bookPath(book.handle, book.slug)">
          <span class="eyebrow">BOOK</span>
          <strong>{{ book.title }}</strong>
        </NuxtLink>
        <NuxtLink class="sidebar-author" :to="spacePath(book.handle)">@{{ book.handle }}</NuxtLink>
      </div>
      <div class="sidebar-label">목차 <span>{{ toc.length }}</span></div>
      <nav v-if="toc.length" aria-label="페이지 목차">
        <ul class="toc-list">
          <li v-for="entry in toc" :key="entry.id">
            <NuxtLink
              :to="pagePath(book.handle, book.slug, entry.id)"
              :aria-current="entry.id === currentId ? 'page' : undefined"
              :class="[`depth-${Math.min(depths.get(entry.id) ?? 0, 6)}`, { active: entry.id === currentId }]"
            >{{ entry.title }}</NuxtLink>
          </li>
        </ul>
      </nav>
      <p v-else class="sidebar-empty">아직 발행된 페이지가 없습니다.</p>
    </aside>
    <div class="reader-content"><slot /></div>
  </div>
</template>
