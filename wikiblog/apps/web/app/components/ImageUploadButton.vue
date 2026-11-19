<script setup lang="ts">
import { ImagePlus, LoaderCircle } from '@lucide/vue';
import { IMAGE_ACCEPT } from '~/utils/imageUpload';

defineProps<{ uploading: boolean; disabled?: boolean; controls?: string }>();
const emit = defineEmits<{ select: [files: File[]] }>();
const input = ref<HTMLInputElement | null>(null);

function open() {
  input.value?.click();
}
function onChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files ?? []);
  // 같은 파일을 다시 고를 수 있게 값을 비운다.
  target.value = '';
  if (files.length) emit('select', files);
}
</script>

<template>
  <button
    class="button button-secondary button-sm"
    type="button"
    :aria-label="uploading ? '이미지 넣기(업로드 중)' : '이미지 넣기'"
    title="이미지 넣기 (PNG·JPEG·WebP·GIF, 2MB 이하)"
    :aria-controls="controls"
    :disabled="disabled"
    @click="open"
  >
    <LoaderCircle v-if="uploading" class="size-4 animate-spin" aria-hidden="true" />
    <ImagePlus v-else class="size-4" aria-hidden="true" />
  </button>
  <input
    ref="input"
    class="hidden"
    type="file"
    :accept="IMAGE_ACCEPT"
    multiple
    tabindex="-1"
    aria-hidden="true"
    @change="onChange"
  >
</template>
