<script setup lang="ts">
import { isNavigationFailure } from 'vue-router';
import { BookOpen, ChevronDown, LogIn, LogOut, Search, User } from '@lucide/vue';
import { spacePath } from '~/utils/paths';
import { avatarInitial } from '~/utils/search';

const query = ref('');
const route = useRoute();
const router = useRouter();
watch(() => route.query.q, (value) => { query.value = typeof value === 'string' ? value : ''; }, { immediate: true });
// 검색 화면은 자체의 큰 검색 입력을 쓰므로 헤더 검색을 숨겨 입력이 두 개 보이지 않게 한다.
const onSearchPage = computed(() => route.path === '/search');

function search() {
  const value = query.value.trim();
  if (value) return navigateTo({ path: '/search', query: { q: value } });
}

// 로그인 상태는 브라우저에서만 조회한다. 조회 전(unknown)에는 같은 크기의 빈 자리를 둬 깜빡임을 줄인다.
const currentUser = useCurrentUser();
onMounted(() => { if (currentUser.status.value === 'unknown') currentUser.refresh(); });

const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
const menuButton = ref<HTMLButtonElement | null>(null);
const loginLink = ref<{ $el: HTMLElement } | null>(null);
const loggingOut = ref(false);
const logoutError = ref('');

function closeMenu(returnFocus = false) {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  logoutError.value = '';
  if (returnFocus) menuButton.value?.focus();
}
function onDocumentPointer(event: Event) {
  if (menuRoot.value && !menuRoot.value.contains(event.target as Node)) closeMenu();
}
function onMenuFocusOut(event: FocusEvent) {
  if (menuRoot.value && event.relatedTarget && !menuRoot.value.contains(event.relatedTarget as Node)) closeMenu();
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer));
watch(() => route.fullPath, () => closeMenu());

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  logoutError.value = '';
  try {
    // 관리 화면에서는 먼저 공개 홈으로 이동한다. 미저장 변경 확인에서 취소하면 로그아웃하지 않는다.
    if (route.path.startsWith('/dashboard')) {
      const failure = await router.push('/');
      if (isNavigationFailure(failure)) return;
    }
    await currentUser.logout();
    menuOpen.value = false;
    await nextTick();
    loginLink.value?.$el.focus();
  } catch {
    logoutError.value = '로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
  } finally {
    loggingOut.value = false;
  }
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
        <form v-if="!onSearchPage" class="header-search" role="search" @submit.prevent="search">
          <label class="sr-only" for="header-query">책과 페이지 검색</label>
          <Search class="size-4 shrink-0" aria-hidden="true" />
          <input id="header-query" v-model="query" type="search" placeholder="책과 페이지 검색" maxlength="200">
          <button type="submit">검색</button>
        </form>
        <div class="header-account" :class="{ 'ml-auto': onSearchPage }">
          <span v-if="currentUser.status.value === 'unknown'" class="block h-9 w-[88px]" aria-hidden="true" />
          <NuxtLink v-else-if="currentUser.status.value === 'anonymous'" ref="loginLink" class="button button-primary button-sm" to="/login">
            <LogIn class="size-4" aria-hidden="true" />로그인
          </NuxtLink>
          <div v-else ref="menuRoot" class="relative" @focusout="onMenuFocusOut" @keydown.esc="closeMenu(true)">
            <button
              ref="menuButton" type="button" class="account-trigger"
              :aria-expanded="menuOpen" aria-controls="account-menu"
              :aria-label="`@${currentUser.handle.value} 계정 메뉴`"
              @click="menuOpen = !menuOpen"
            >
              <span class="avatar" aria-hidden="true">{{ avatarInitial(currentUser.handle.value ?? '') }}</span>
              <span class="max-w-32 truncate max-sm:hidden" aria-hidden="true">@{{ currentUser.handle.value }}</span>
              <ChevronDown :size="16" :stroke-width="2" class="size-4 shrink-0 text-muted transition-transform" :class="{ 'rotate-180': menuOpen }" aria-hidden="true" />
            </button>
            <div v-show="menuOpen" id="account-menu" class="absolute right-0 top-[calc(100%+8px)] z-30 w-56 rounded-card border border-line bg-white p-1.5 shadow-lg">
              <p class="truncate px-3 pt-1.5 pb-2 text-xs font-semibold text-muted">@{{ currentUser.handle.value }}</p>
              <ul class="m-0 list-none p-0">
                <li>
                  <NuxtLink class="account-menu-item" :to="spacePath(currentUser.handle.value ?? '')">
                    <User class="size-4" aria-hidden="true" />내 공간
                  </NuxtLink>
                </li>
                <li>
                  <NuxtLink class="account-menu-item" to="/dashboard/books">
                    <BookOpen class="size-4" aria-hidden="true" />내 책 관리
                  </NuxtLink>
                </li>
                <li class="mt-1 border-t border-line pt-1">
                  <button class="account-menu-item w-full" type="button" :disabled="loggingOut" @click="logout">
                    <LogOut class="size-4" aria-hidden="true" />{{ loggingOut ? '로그아웃 중…' : '로그아웃' }}
                  </button>
                </li>
              </ul>
              <p v-if="logoutError" class="m-0 px-3 py-2 text-xs text-danger" role="alert">{{ logoutError }}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
    <main id="main" class="main-content"><slot /></main>
    <footer class="site-footer"><div>WikiBlog <span>·</span> 함께 읽고, 지식을 쌓는 공간</div></footer>
  </div>
</template>
