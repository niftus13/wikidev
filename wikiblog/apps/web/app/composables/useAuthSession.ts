import type { SessionResponse } from '@wikiblog/dto';

export function useAuthSession() {
  return useFetch<SessionResponse>('/api/v1/auth/session');
}
