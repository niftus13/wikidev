<script setup lang="ts">
import type { LoginRequest, RegisterRequest } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';

const props = defineProps<{ mode: 'login' | 'register' }>();
const email = ref('');
const password = ref('');
const handle = ref('');
const busy = ref(false);
const error = ref('');

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
  <div class="container auth-page">
    <p class="eyebrow">AUTHOR</p>
    <h1>{{ mode === 'login' ? '로그인' : '회원가입' }}</h1>
    <p class="page-intro">{{ mode === 'login' ? '내 책을 관리하려면 로그인하세요.' : '계정을 만들고 나만의 책을 시작하세요.' }}</p>
    <form class="editor-form" @submit.prevent="submit">
      <label for="auth-email">이메일</label>
      <input id="auth-email" v-model="email" type="email" autocomplete="email" maxlength="254" :disabled="busy" required>
      <template v-if="mode === 'register'">
        <label for="auth-handle">사용자 이름</label>
        <input id="auth-handle" v-model="handle" type="text" autocomplete="username" minlength="3" maxlength="30" :disabled="busy" required aria-describedby="handle-help">
        <p id="handle-help" class="field-help">영문·숫자로 시작하고 영문, 숫자, _ 또는 -를 사용해 3~30자로 입력하세요.</p>
      </template>
      <label for="auth-password">비밀번호</label>
      <input id="auth-password" v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" minlength="12" :disabled="busy" required aria-describedby="password-help">
      <p id="password-help" class="field-help">12자 이상, UTF-8 기준 1024바이트 이내로 입력하세요.</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기' }}</button>
    </form>
    <p class="auth-alternative" v-if="mode === 'login'">계정이 없으신가요? <NuxtLink class="text-link" to="/register">회원가입</NuxtLink></p>
    <p class="auth-alternative" v-else>이미 계정이 있으신가요? <NuxtLink class="text-link" to="/login">로그인</NuxtLink></p>
  </div>
</template>
