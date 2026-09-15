/**
 * 시연용 게스트 세션 생존 확인. 관리자가 "게스트 전체 해제"를 누르면 선점 토큰이 무효가 되는데,
 * 아무 조작도 하지 않고 화면만 보고 있는 게스트는 API를 부르지 않아 로그아웃되지 않는다 —
 * 10초마다 가벼운 확인 요청을 보내 401(useApi가 자동 로그아웃 처리)이 곧바로 떨어지게 한다.
 */
export default defineNuxtPlugin(() => {
  const { user } = useCurrentUser()
  const api = useApi()

  setInterval(() => {
    if (!user.value?.isGuest) return
    api('/api/guests/me').catch(() => {
      // 401은 useApi의 onResponseError가 처리한다. 그 외 오류는 다음 주기에 다시 시도.
    })
  }, 10_000)
})
