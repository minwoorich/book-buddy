import type { H3Event } from 'h3'
import { guestRepo } from '../repositories/guestRepo'
import { ApiError, toHttpError } from './errors'
import type { User } from '../../shared/types'

/**
 * `x-user-id` 헤더로 로그인 사용자를 조회한다. 헤더가 없거나 존재하지 않는 유저면 undefined.
 * 시연용 게스트 계정은 `x-guest-token`이 선점 토큰과 일치해야 통과한다(guestRepo.resolveUser).
 */
export function optionalUser(event: H3Event): User | undefined {
  const header = getHeader(event, 'x-user-id')
  if (!header) return undefined
  const userId = Number(header)
  if (!Number.isFinite(userId)) return undefined
  return guestRepo.resolveUser(userId, getHeader(event, 'x-guest-token'))
}

/** `x-user-id` 헤더로 로그인 사용자를 조회한다. 없거나 존재하지 않는 유저면 401. */
export function requireUser(event: H3Event): User {
  const user = optionalUser(event)
  if (!user) throw new ApiError(401, '로그인이 필요해요')
  return user
}

/** requireUser + role 검사. admin이 아니면 403. */
export function requireAdmin(event: H3Event): User {
  const user = requireUser(event)
  if (user.role !== 'admin') throw new ApiError(403, '관리자만 접근할 수 있어요')
  return user
}

/**
 * 쿼리스트링의 `userId` 값을 안전하게 파싱한다. `Number('')===0`, `Number('abc')===NaN`이
 * 그대로 유효한 userId처럼 취급되면(예: `?userId=` 빈 값) 자기 자신이 아닌 다른 id로 오인돼
 * 403이 나는 문제가 있었다 — 유한한 양의 정수일 때만 값을 채택하고, 그 외(빈 문자열/숫자가
 * 아닌 문자열/0 이하)는 전부 "생략됨"으로 취급해 호출부가 기본값(me.id)으로 폴백하게 한다.
 */
export function parseQueryUserId(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * API 핸들러 래퍼. ApiError를 h3의 createError로 변환해 statusCode/message가
 * 응답에 그대로 실리게 한다. 외부 SDK 에러는 502로 감싸고(toHttpError 참고),
 * 그 외 예외는 그대로 다시 던진다.
 */
export function handleApi<T>(fn: (event: H3Event) => T | Promise<T>) {
  return async (event: H3Event): Promise<T> => {
    try {
      return await fn(event)
    } catch (err) {
      const mapped = toHttpError(err)
      if (mapped) throw createError({ ...mapped, cause: err })
      throw err
    }
  }
}
