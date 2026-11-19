<script setup lang="ts">
import type { LoginRequest, RegisterRequest } from '@wikiblog/dto';
import { AtSign, CircleAlert, Eye, EyeOff, LoaderCircle, Lock, LogIn, Mail, UserPlus } from '@lucide/vue';
import { apiErrorStatus } from '~/utils/apiError';

const props = defineProps<{ mode: 'login' | 'register' }>();
const email = ref('');
const password = ref('');
const handle = ref('');
const showPassword = ref(false);
const busy = ref(false);
const error = ref('');
const currentUser = useCurrentUser();

const inputClass = 'block h-control w-full min-w-0 rounded-control border border-input bg-white pr-3 pl-10 text-ink placeholder:text-[#9aa7b6] disabled:bg-soft disabled:text-muted';
const iconClass = 'pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-[#8a9aab]';

async function submit() {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    if (props.mode === 'register') {
      const body: RegisterRequest = { email: email.value, password: password.value, handle: handle.value };
      await $fetch('/api/v1/auth/register', { method: 'POST', body });
    } else {
      const body: LoginRequest = { email: email.value, password: password.value };
      await $fetch('/api/v1/auth/login', { method: 'POST', body });
    }
    // 헤더의 로그인 상태를 새 세션으로 바꾼 뒤 이동한다(조회 실패는 비로그인으로 표시될 뿐 이동은 계속한다).
    await currentUser.refresh();
    await navigateTo('/dashboard/books');
  } catch (cause) {
    const status = apiErrorStatus(cause);
    if (status === 400) error.value = props.mode === 'register'
      ? '이메일, 비밀번호와 사용자 이름의 형식을 확인해 주세요.'
      : '이메일과 비밀번호의 형식을 확인해 주세요.';
    else if (status === 401) error.value = '이메일 또는 비밀번호가 올바르지 않습니다.';
    else if (status === 409) error.value = '이미 사용 중인 이메일 또는 사용자 이름입니다.';
    else if (status === 429) error.value = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    else error.value = '요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="container flex justify-center pt-14 pb-20 max-sm:pt-8">
    <div class="w-full max-w-[440px]">
      <div class="rounded-card border border-line bg-white p-8 shadow-[0_8px_24px_#263e5910] max-sm:px-5 max-sm:py-6">
        <div class="mb-6 text-center">
          <span class="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-[#d7e5fa] bg-accent-soft text-accent" aria-hidden="true">
            <LogIn v-if="mode === 'login'" class="size-[22px]" />
            <UserPlus v-else class="size-[22px]" />
          </span>
          <h1 class="m-0 text-[28px] font-bold tracking-[-.04em]">{{ mode === 'login' ? '로그인' : '회원가입' }}</h1>
          <p class="mt-1.5 mb-0 text-[15px] text-muted">{{ mode === 'login' ? '내 책을 관리하려면 로그인하세요.' : '계정을 만들고 나만의 책을 시작하세요.' }}</p>
        </div>
        <form class="grid gap-4" @submit.prevent="submit">
          <div class="grid gap-1.5">
            <label class="text-sm font-bold" for="auth-email">이메일</label>
            <div class="relative">
              <Mail :class="iconClass" aria-hidden="true" />
              <input id="auth-email" v-model="email" :class="inputClass" type="email" autocomplete="email" placeholder="name@example.com" maxlength="254" :disabled="busy" required>
            </div>
          </div>
          <div v-if="mode === 'register'" class="grid gap-1.5">
            <label class="text-sm font-bold" for="auth-handle">사용자 이름</label>
            <div class="relative">
              <AtSign :class="iconClass" aria-hidden="true" />
              <input id="auth-handle" v-model="handle" :class="inputClass" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="30" :disabled="busy" required aria-describedby="handle-help">
            </div>
            <p id="handle-help" class="field-help">영문·숫자로 시작하고 영문, 숫자, _ 또는 -를 사용해 3~30자로 입력하세요. 공간 주소(/@사용자 이름)가 됩니다.</p>
          </div>
          <div class="grid gap-1.5">
            <label class="text-sm font-bold" for="auth-password">비밀번호</label>
            <div class="relative">
              <Lock :class="iconClass" aria-hidden="true" />
              <input
                id="auth-password" v-model="password" :class="[inputClass, 'pr-12']" :type="showPassword ? 'text' : 'password'"
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" minlength="12" :disabled="busy" required aria-describedby="password-help"
              >
              <button
                type="button" class="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-[#6b7b8e] hover:bg-soft hover:text-ink"
                :aria-label="showPassword ? '비밀번호 숨기기' : '비밀번호 보기'" :aria-pressed="showPassword" aria-controls="auth-password"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" class="size-[18px]" aria-hidden="true" />
                <Eye v-else class="size-[18px]" aria-hidden="true" />
              </button>
            </div>
            <p id="password-help" class="field-help">12자 이상, UTF-8 기준 1024바이트 이내로 입력하세요.</p>
          </div>
          <p v-if="error" class="m-0 flex items-start gap-2 rounded-control border border-danger-line bg-danger-soft px-3 py-2.5 text-sm text-danger" role="alert">
            <CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ error }}
          </p>
          <button class="button button-primary mt-1 w-full" type="submit" :disabled="busy">
            <LoaderCircle v-if="busy" class="size-4 animate-spin" aria-hidden="true" />
            <LogIn v-else-if="mode === 'login'" class="size-4" aria-hidden="true" />
            <UserPlus v-else class="size-4" aria-hidden="true" />
            {{ busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기' }}
          </button>
        </form>
      </div>
      <p class="mt-5 text-center text-sm text-muted">
        <template v-if="mode === 'login'">계정이 없으신가요? <NuxtLink class="text-link ml-1 text-sm text-accent hover:underline" to="/register">회원가입</NuxtLink></template>
        <template v-else>이미 계정이 있으신가요? <NuxtLink class="text-link ml-1 text-sm text-accent hover:underline" to="/login">로그인</NuxtLink></template>
      </p>
    </div>
  </div>
</template>
