/**
 * 로그인 가드.
 *
 * - SSR(첫 렌더)에서는 판정하지 않고 통과시킨다. 로그인 상태는 localStorage 기반이라
 *   서버에서는 알 수 없기 때문이다(클라이언트 전용 플러그인 `restore-current-user.client.ts`가
 *   `applyPlugins` 단계에서 복원을 마치므로, 아래 클라이언트 판정 시점에는 이미 user 상태가 채워져 있다).
 * - 클라이언트에서 로그인한 사용자가 없으면 `/login`으로 보낸다.
 * - `/admin`(하위 경로 포함)은 admin 권한이 없으면 `/`로 보낸다.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const { user } = useCurrentUser()

  if (!user.value) {
    if (to.path === '/login') return
    return navigateTo('/login')
  }

  if (to.path === '/admin' || to.path.startsWith('/admin/')) {
    if (user.value.role !== 'admin') return navigateTo('/')
  }
})
