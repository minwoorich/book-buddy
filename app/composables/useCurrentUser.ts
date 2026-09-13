import type { User } from '#shared/types'

export const CURRENT_USER_STORAGE_KEY = 'bb:user'

/**
 * 로그인 상태를 SSR 안전하게 다루는 컴포저블.
 *
 * useState는 서버에서 만든 초기값을 payload로 클라이언트에 그대로 넘기고,
 * 클라이언트에서는 그 값이 `undefined`일 때만 초기화 함수를 다시 실행한다.
 * 여기서는 서버/클라이언트 모두 `null`에서 시작시켜 하이드레이션 불일치를 막고,
 * localStorage 복원은 클라이언트 전용 플러그인(`app/plugins/restore-current-user.client.ts`)에서
 * 마운트 시점에 한 번 수행한다.
 */
export function useCurrentUser() {
  const user = useState<User | null>('bb:user', () => null)

  function persist(u: User | null) {
    if (!import.meta.client) return
    try {
      if (u) {
        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(u))
      } else {
        localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
      }
    } catch {
      // localStorage 접근 실패(프라이빗 모드 등)는 무시한다.
    }
  }

  function login(u: User) {
    user.value = u
    persist(u)
  }

  function logout() {
    user.value = null
    persist(null)
  }

  return { user, login, logout }
}
