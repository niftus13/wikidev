<script setup lang="ts">
import type { SessionResponse, TagDto } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';

usePageMeta({ title: '분류 관리', noindex: true });
const session = ref<SessionResponse | null>(null);
const loading = ref(true);
const loadError = ref('');
const tags = ref<TagDto[]>([]);
const tagsError = ref('');
const tagName = ref('');
const tagBusy = ref(false);
const deletingTagId = ref<string | null>(null);
const tagError = ref('');
const tagNotice = ref('');
const categoryManager = ref<{ hasInput: boolean; busy: boolean } | null>(null);

async function loadTags() {
  tagsError.value = '';
  try {
    tags.value = await $fetch<TagDto[]>('/api/v1/me/tags');
  } catch (cause) {
    tagsError.value = apiErrorStatus(cause) === 401 ? '세션이 만료되었습니다. 다시 로그인해 주세요.' : '태그를 불러오지 못했습니다.';
  }
}
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    session.value = await $fetch<SessionResponse>('/api/v1/auth/session');
    await loadTags();
  } catch (cause) {
    session.value = null;
    loadError.value = apiErrorStatus(cause) === 401 ? 'login' : 'error';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function tagMessage(cause: unknown, action: 'create' | 'delete') {
  const status = apiErrorStatus(cause);
  if (status === 400) return '태그 이름을 확인해 주세요. 앞의 #과 공백을 제외하고 1~100자여야 합니다.';
  if (status === 401) return '세션이 만료되었습니다. 다른 탭에서 다시 로그인한 뒤 이 화면의 입력을 복사해 보관해 주세요.';
  if (status === 403) return '인증 정보가 변경되었거나 요청이 거부되었습니다. 입력을 복사해 보관한 뒤 새로고침해 주세요.';
  if (status === 404) return '태그를 찾을 수 없습니다. 다른 탭에서 삭제되었을 수 있으니 목록을 새로고침해 주세요.';
  if (status === 409) return action === 'create'
    ? '이미 있는 태그입니다. 앞의 #, 앞뒤 공백과 영문 대소문자는 구분하지 않습니다. 목록에서 기존 태그를 사용해 주세요.'
    : '책이나 페이지(삭제된 콘텐츠와 과거 이력 포함)에 연결된 태그는 삭제할 수 없습니다. 연결된 분류에서 태그를 해제한 뒤 다시 시도해 주세요.';
  return '요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
}
async function createTag() {
  if (tagBusy.value || !session.value) return;
  tagBusy.value = true;
  tagError.value = '';
  tagNotice.value = '';
  try {
    const tag = await $fetch<TagDto>('/api/v1/me/tags', {
      method: 'POST', headers: { 'X-CSRF-Token': session.value.csrfToken }, body: { name: tagName.value },
    });
    tags.value = [...tags.value, tag];
    tagName.value = '';
    tagNotice.value = `태그 #${tag.name}을(를) 만들었습니다.`;
  } catch (cause) {
    tagError.value = tagMessage(cause, 'create');
  } finally {
    tagBusy.value = false;
  }
}
async function deleteTag(tag: TagDto) {
  if (tagBusy.value || !session.value) return;
  tagBusy.value = true;
  tagError.value = '';
  tagNotice.value = '';
  try {
    await $fetch(`/api/v1/me/tags/${tag.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': session.value.csrfToken }, body: {} });
    tags.value = tags.value.filter((item) => item.id !== tag.id);
    deletingTagId.value = null;
    tagNotice.value = `태그 #${tag.name}을(를) 삭제했습니다.`;
  } catch (cause) {
    tagError.value = tagMessage(cause, 'delete');
  } finally {
    tagBusy.value = false;
  }
}

function canLeave() {
  if (tagBusy.value || categoryManager.value?.busy) {
    tagError.value = '요청이 처리되는 동안 기다려 주세요.';
    return false;
  }
  if (tagName.value || categoryManager.value?.hasInput) return window.confirm('작성 중인 입력이 있습니다. 이 화면을 나가시겠습니까?');
  return true;
}
onBeforeRouteLeave(canLeave);
</script>

<template>
  <div class="container dashboard-page narrow">
    <div class="breadcrumbs"><NuxtLink to="/dashboard/books">내 책 관리</NuxtLink><span>/</span><span>분류 관리</span></div>
    <p class="eyebrow dashboard-eyebrow">AUTHOR · CLASSIFICATION</p>
    <div class="section-heading">
      <div><h1>분류 관리</h1><p>책에 지정할 내 카테고리와 책·페이지에 붙일 태그를 관리하세요.</p></div>
    </div>
    <p v-if="loading" class="state" role="status">계정과 분류를 불러오는 중입니다.</p>
    <div v-else-if="loadError === 'login'" class="state">분류를 관리하려면 <NuxtLink class="text-link" to="/login">로그인</NuxtLink>하세요.</div>
    <div v-else-if="loadError" class="state" role="alert">계정 정보를 불러오지 못했습니다. <button class="link-button" type="button" @click="load()">다시 시도</button></div>
    <template v-else-if="session">
      <CategoryManager
        ref="categoryManager"
        list-url="/api/v1/me/categories"
        mutate-url="/api/v1/me/categories"
        :csrf-token="session.csrfToken"
        heading="내 책 카테고리"
        description="책을 분류하는 계층형 카테고리입니다. 책마다 하나를 지정하며, 이름과 계층 변경은 공개 화면에 즉시 반영됩니다."
        id-prefix="space-category"
      />
      <section class="editor-panel" aria-labelledby="tags-heading">
        <h2 id="tags-heading">태그</h2>
        <p class="field-help">책과 페이지에 붙이는 태그입니다. 앞의 #, 앞뒤 공백과 영문 대소문자를 무시해 중복을 판단합니다. 이름은 바꿀 수 없습니다.</p>
        <div v-if="tagsError" class="state" role="alert">{{ tagsError }} <button class="link-button" type="button" @click="loadTags()">다시 시도</button></div>
        <template v-else>
          <form class="editor-form tag-create-form" @submit.prevent="createTag">
            <label for="new-tag-name">새 태그</label>
            <div class="inline-field">
              <input id="new-tag-name" v-model="tagName" maxlength="101" placeholder="#태그" :disabled="tagBusy" required>
              <button class="button button-primary" type="submit" :disabled="tagBusy">{{ tagBusy ? '처리 중…' : '태그 만들기' }}</button>
            </div>
          </form>
          <p v-if="tagNotice" class="form-success" role="status">{{ tagNotice }}</p>
          <p v-if="tagError" class="form-error" role="alert">{{ tagError }} <NuxtLink v-if="tagError.includes('세션이 만료')" class="text-link" to="/login" target="_blank">새 탭에서 로그인</NuxtLink></p>
          <p v-if="!tags.length" class="state">아직 태그가 없습니다.</p>
          <ul v-else class="managed-books tag-list">
            <li v-for="tag in tags" :key="tag.id">
              <div class="managed-book-content"><h3>#{{ tag.name }}</h3></div>
              <div class="managed-book-actions">
                <button class="link-button danger-link" type="button" :disabled="tagBusy" @click="deletingTagId = tag.id; tagError = ''; tagNotice = ''">삭제</button>
              </div>
              <div v-if="deletingTagId === tag.id" class="delete-confirm">
                <p>태그 #{{ tag.name }}을(를) 삭제하시겠습니까? 책이나 페이지 이력에 연결된 태그는 삭제되지 않습니다.</p>
                <button class="button button-danger" type="button" :disabled="tagBusy" @click="deleteTag(tag)">{{ tagBusy ? '삭제 중…' : '삭제 확인' }}</button>
                <button class="button button-secondary" type="button" :disabled="tagBusy" @click="deletingTagId = null">취소</button>
              </div>
            </li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>
