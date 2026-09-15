import type { User } from '#shared/types'
import { CURRENT_USER_STORAGE_KEY, GUEST_TOKEN_STORAGE_KEY, useCurrentUser } from '../composables/useCurrentUser'

/**
 * 앱 시작 시 localStorage(`bb:user`)에 저장된 로그인 사용자를 useState로 복원한다.
 * useState의 초기화 함수는 서버 payload가 있으면 클라이언트에서 재실행되지 않으므로
 * 복원 로직은 플러그인에서 처리한다. 전역 미들웨어(auth.global.ts)보다 먼저 실행되도록
 * 기본(defineNuxtPlugin) 플러그인으로 둔다.
 */
export default defineNuxtPlugin(() => {
  const { user, guestToken } = useCurrentUser()
  if (user.value) return

  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY)
    if (raw) {
      user.value = JSON.parse(raw) as User
      guestToken.value = localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)
    }
  } catch {
    // localStorage 접근 실패(프라이빗 모드 등)는 무시한다.
  }
})
