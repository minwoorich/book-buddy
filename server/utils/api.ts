import type { H3Event } from 'h3'
import { userRepo } from '../repositories/userRepo'
import { ApiError } from './errors'
import type { User } from '../../shared/types'

/** `x-user-id` 헤더로 로그인 사용자를 조회한다. 헤더가 없거나 존재하지 않는 유저면 undefined. */
export function optionalUser(event: H3Event): User | undefined {
  const header = getHeader(event, 'x-user-id')
  if (!header) return undefined
  const userId = Number(header)
  if (!Number.isFinite(userId)) return undefined
  return userRepo.findById(userId)
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
 * API 핸들러 래퍼. ApiError를 h3의 createError로 변환해 statusCode/message가
 * 응답에 그대로 실리게 한다. ApiError가 아닌 예외는 그대로 다시 던진다.
 */
export function handleApi<T>(fn: (event: H3Event) => T | Promise<T>) {
  return async (event: H3Event): Promise<T> => {
    try {
      return await fn(event)
    } catch (err) {
      if (err instanceof ApiError) {
        throw createError({ statusCode: err.statusCode, message: err.message })
      }
      throw err
    }
  }
}
