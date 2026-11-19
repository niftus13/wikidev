import type { SessionResponse } from '@wikiblog/dto';
import { apiErrorStatus } from '~/utils/apiError';

/** 헤더·공간 화면이 함께 쓰는 로그인 상태. 서버 렌더링에서는 항상 `unknown`이며 세션 정보를 HTML에 넣지 않는다. */
export type CurrentUserStatus = 'unknown' | 'anonymous' | 'authenticated';

interface CurrentUserState {
  status: CurrentUserStatus;
  session: SessionResponse | null;
}

let pending: Promise<void> | null = null;

export function useCurrentUser() {
  const state = useState<CurrentUserState>('current-user', () => ({ status: 'unknown', session: null }));

  function set(session: SessionResponse | null) {
    state.value = session ? { status: 'authenticated', session } : { status: 'anonymous', session: null };
  }

  /** 브라우저에서만 세션을 조회한다. 동시에 여러 곳에서 불러도 요청은 하나다. */
  function refresh(): Promise<void> {
    if (import.meta.server) return Promise.resolve();
    pending ??= $fetch<SessionResponse>('/api/v1/auth/session')
      .then((session) => set(session))
      // 401뿐 아니라 일시 오류도 비로그인으로 보여 로그인 진입을 막지 않는다. 권한은 서버가 판단한다.
      .catch(() => set(null))
      .finally(() => { pending = null; });
    return pending;
  }

  /** 기존 관리 화면과 같이 CSRF 토큰을 붙여 로그아웃한다. 이미 만료된 세션(401)은 로그아웃된 것으로 본다. */
  async function logout(): Promise<void> {
    const session = state.value.session;
    if (!session) return set(null);
    try {
      await $fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken }, body: {} });
    } catch (cause) {
      if (apiErrorStatus(cause) !== 401) throw cause;
    }
    set(null);
  }

  return {
    status: computed(() => state.value.status),
    session: computed(() => state.value.session),
    handle: computed(() => state.value.session?.space.handle ?? null),
    set,
    refresh,
    logout,
  };
}
