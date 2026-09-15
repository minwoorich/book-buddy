import { describe, it, expect } from 'vitest'
import { ApiError, toHttpError } from '../server/utils/errors'

describe('toHttpError', () => {
  it('ApiError는 상태코드와 메시지를 그대로 쓴다', () => {
    expect(toHttpError(new ApiError(400, '검색어를 입력해주세요'))).toEqual({
      statusCode: 400,
      message: '검색어를 입력해주세요',
    })
  })

  it('외부 SDK 에러의 401은 우리 인증 401로 새지 않고 502로 감싼다', () => {
    const sdkErr = Object.assign(new Error('401 {"type":"authentication_error"}'), { status: 401 })
    const mapped = toHttpError(sdkErr)
    expect(mapped?.statusCode).toBe(502)
    expect(mapped?.message).not.toContain('authentication_error')
  })

  it('statusCode 필드를 가진 외부 에러도 502로 감싼다', () => {
    const err = Object.assign(new Error('rate limited'), { statusCode: 429 })
    expect(toHttpError(err)?.statusCode).toBe(502)
  })

  it('상태코드가 없는 일반 에러는 null(그대로 500)', () => {
    expect(toHttpError(new Error('boom'))).toBeNull()
    expect(toHttpError('string')).toBeNull()
  })
})
