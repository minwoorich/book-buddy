import type { FetchError } from 'ofetch'

/**
 * `$fetch` 래퍼. 로그인한 사용자가 있으면 모든 요청에 `x-user-id` 헤더를 자동으로 붙인다.
 */
export function useApi() {
  const { user } = useCurrentUser()

  return $fetch.create({
    onRequest({ options }) {
      if (!user.value) return
      const headers = new Headers(options.headers)
      headers.set('x-user-id', String(user.value.id))
      options.headers = headers
    },
  })
}

/** ofetch 에러에서 서버가 내려준 메시지를 뽑아낸다. 없으면 기본 문구를 돌려준다. */
export function apiErrorMessage(e: unknown): string {
  const err = e as FetchError | undefined
  const data = err?.data as { message?: string } | undefined
  return data?.message ?? '문제가 발생했어요'
}
