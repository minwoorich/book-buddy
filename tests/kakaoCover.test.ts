import { describe, it, expect } from 'vitest'
import { extractOriginalCover } from '../server/services/kakaoBookService'

describe('extractOriginalCover', () => {
  it('fname 쿼리 파라미터에서 원본 고화질 표지 URL을 추출하고, http면 https로 승격한다', () => {
    const original = 'http://bookthumb-phinf.pstatic.net/cover/158/xxx.jpg'
    const thumbnail = `https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=${encodeURIComponent(original)}`
    expect(extractOriginalCover(thumbnail)).toBe('https://bookthumb-phinf.pstatic.net/cover/158/xxx.jpg')
  })

  it('fname이 없으면 원값을 그대로 반환한다', () => {
    const thumbnail = 'https://example.com/some-cover.jpg'
    expect(extractOriginalCover(thumbnail)).toBe(thumbnail)
  })

  it('thumbnail이 빈 문자열이면 null을 반환한다', () => {
    expect(extractOriginalCover('')).toBeNull()
  })
})
