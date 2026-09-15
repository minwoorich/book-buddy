import type { FetchError } from 'ofetch'

/**
 * `$fetch` 래퍼. 로그인한 사용자가 있으면 모든 요청에 `x-user-id` 헤더를 자동으로 붙이고,
 * 시연용 게스트면 선점 토큰(`x-guest-token`)도 함께 보낸다.
 */
export function useApi() {
  const { user, guestToken, logout } = useCurrentUser()

  return $fetch.create({
    onRequest({ options }) {
      if (!user.value) return
      const headers = new Headers(options.headers)
      headers.set('x-user-id', String(user.value.id))
      if (guestToken.value) headers.set('x-guest-token', guestToken.value)
      options.headers = headers
    },
    onResponseError({ response }) {
      // 로그인된 상태인데 401이면 유령 세션이다 — 데이터 리시드로 사용자 id가 갈리면
      // localStorage의 옛 사용자가 남아 모든 인증 API가 조용히 401로 실패한다.
      // 세션을 비우고 로그인 화면으로 보내 혼란(빈 화면·폴백 오동작)을 끊는다.
      // 게스트는 관리자가 일괄 해제하면 토큰이 무효가 돼 같은 경로로 로그아웃된다.
      if (response.status === 401 && user.value && import.meta.client) {
        const wasGuest = user.value.isGuest
        logout()
        alert(
          wasGuest
            ? '게스트 세션이 종료됐어요. 다시 게스트를 선택해 주세요.'
            : '로그인 정보가 만료됐어요. 다시 로그인해 주세요. (데이터가 갱신되면 발생할 수 있어요)'
        )
        void navigateTo('/login')
      }
    },
  })
}

/** ofetch 에러에서 서버가 내려준 메시지를 뽑아낸다. 없으면 기본 문구를 돌려준다. */
export function apiErrorMessage(e: unknown): string {
  const err = e as FetchError | undefined
  const data = err?.data as { message?: string } | undefined
  return data?.message ?? '문제가 발생했어요'
}
