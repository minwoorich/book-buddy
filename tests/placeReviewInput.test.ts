import { describe, it, expect } from 'vitest'
import {
  parsePlaceReviewInput,
  parseKakaoPlaceId,
  parseImagePaths,
  parseKeepImagesField,
} from '../server/utils/placeReview'
import { ApiError } from '../server/utils/errors'

describe('parsePlaceReviewInput', () => {
  it('정상 입력을 정규화한다 — trim, 태그 중복 제거, 코멘트 생략 시 빈 문자열', () => {
    expect(
      parsePlaceReviewInput({ placeName: ' 카페 온점 ', tags: ['quiet', 'outlet', 'quiet'] })
    ).toEqual({ placeName: '카페 온점', tags: ['quiet', 'outlet'], comment: '', images: [] })
    expect(
      parsePlaceReviewInput({ placeName: '카페', tags: ['bright'], comment: '  창가 자리 좋아요 ' })
    ).toEqual({ placeName: '카페', tags: ['bright'], comment: '창가 자리 좋아요', images: [] })
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

describe('사진 경로 검증', () => {
  it('uploadService가 만든 경로만 통과하고 중복은 하나로 줄인다', () => {
    expect(parseImagePaths(['/api/uploads/a.jpg', '/api/uploads/a.jpg', '/api/uploads/b.png'])).toEqual([
      '/api/uploads/a.jpg',
      '/api/uploads/b.png',
    ])
    expect(parseImagePaths(undefined)).toEqual([])
  })

  it('경로 탈출·외부 URL·이상한 확장자는 400', () => {
    expect(() => parseImagePaths(['/api/uploads/../../secret.jpg'])).toThrow('사진 경로')
    expect(() => parseImagePaths(['https://evil.example/a.jpg'])).toThrow('사진 경로')
    expect(() => parseImagePaths(['/api/uploads/a.svg'])).toThrow('사진 경로')
    expect(() => parseImagePaths('/api/uploads/a.jpg')).toThrow('사진 목록')
  })

  it('3장을 넘기면 400', () => {
    const four = ['a', 'b', 'c', 'd'].map((n) => `/api/uploads/${n}.jpg`)
    expect(() => parseImagePaths(four)).toThrow('최대 3장')
  })

  it('keepImages 필드는 JSON 배열 문자열을 받는다', () => {
    expect(parseKeepImagesField(JSON.stringify(['/api/uploads/a.jpg']))).toEqual(['/api/uploads/a.jpg'])
    expect(parseKeepImagesField(undefined)).toEqual([])
    expect(parseKeepImagesField('')).toEqual([])
    expect(() => parseKeepImagesField('{oops')).toThrow('사진 목록')
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
