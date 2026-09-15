import { describe, it, expect } from 'vitest'
import { parsePlaceReviewInput, parseKakaoPlaceId } from '../server/utils/placeReview'
import { ApiError } from '../server/utils/errors'

describe('parsePlaceReviewInput', () => {
  it('정상 입력을 정규화한다 — trim, 태그 중복 제거, 코멘트 생략 시 빈 문자열', () => {
    expect(
      parsePlaceReviewInput({ placeName: ' 카페 온점 ', tags: ['quiet', 'outlet', 'quiet'] })
    ).toEqual({ placeName: '카페 온점', tags: ['quiet', 'outlet'], comment: '' })
    expect(
      parsePlaceReviewInput({ placeName: '카페', tags: ['bright'], comment: '  창가 자리 좋아요 ' })
    ).toEqual({ placeName: '카페', tags: ['bright'], comment: '창가 자리 좋아요' })
  })

  it('장소 이름이 없으면 400', () => {
    expect(() => parsePlaceReviewInput({ tags: ['quiet'] })).toThrow(ApiError)
    expect(() => parsePlaceReviewInput({ placeName: '  ', tags: ['quiet'] })).toThrow('장소 이름')
  })

  it('태그가 없거나 배열이 아니면 400', () => {
    expect(() => parsePlaceReviewInput({ placeName: '카페', tags: [] })).toThrow('태그를 하나 이상')
    expect(() => parsePlaceReviewInput({ placeName: '카페', tags: 'quiet' })).toThrow('태그를 하나 이상')
  })

  it('모르는 태그 코드는 400', () => {
    expect(() => parsePlaceReviewInput({ placeName: '카페', tags: ['quiet', 'wifi'] })).toThrow('알 수 없는 태그')
  })

  it('코멘트 80자 초과는 400, 80자는 통과', () => {
    const ok = 'a'.repeat(80)
    expect(parsePlaceReviewInput({ placeName: '카페', tags: ['quiet'], comment: ok }).comment).toBe(ok)
    expect(() =>
      parsePlaceReviewInput({ placeName: '카페', tags: ['quiet'], comment: 'a'.repeat(81) })
    ).toThrow('80자')
  })
})

describe('parseKakaoPlaceId', () => {
  it('숫자 문자열만 통과시킨다', () => {
    expect(parseKakaoPlaceId('78911659')).toBe('78911659')
    expect(() => parseKakaoPlaceId('abc')).toThrow(ApiError)
    expect(() => parseKakaoPlaceId('')).toThrow(ApiError)
    expect(() => parseKakaoPlaceId(undefined)).toThrow(ApiError)
    expect(() => parseKakaoPlaceId('1'.repeat(21))).toThrow(ApiError)
  })
})
