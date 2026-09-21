import { describe, it, expect } from 'vitest'
import { parseIdParam } from '../server/utils/api'
import { ApiError } from '../server/utils/errors'

describe('parseIdParam', () => {
  it('양의 정수 문자열만 받는다', () => {
    expect(parseIdParam('12', '모임 번호')).toBe(12)
  })
  it('undefined·빈 문자열·NaN·0·소수·음수는 400', () => {
    for (const v of [undefined, '', 'abc', '0', '1.5', '-3']) {
      expect(() => parseIdParam(v, '모임 번호')).toThrow(ApiError)
    }
  })
})
