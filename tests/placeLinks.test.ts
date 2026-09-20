import { describe, expect, it } from 'vitest'
import type { Place } from '../shared/types'
import { formatDistance, hasCoords, kakaoMapUrl } from '../app/utils/place'

/** 장소 카드와 지도 위 요약 카드가 함께 쓰는 표시용 헬퍼. */

const place = (over: Partial<Place> = {}): Place => ({
  name: '카페 인 사이드',
  category: '카페',
  address: '경기 화성시 동탄구 삼성1로 209',
  mapx: 1270749129,
  mapy: 372218632,
  lat: 37.2218,
  lng: 127.0749,
  ...over,
})

describe('kakaoMapUrl', () => {
  it('상세 페이지 주소가 있으면 그쪽을 쓴다', () => {
    expect(kakaoMapUrl(place({ placeUrl: 'http://place.map.kakao.com/123' }), 'map')).toBe('http://place.map.kakao.com/123')
  })

  it('상세 주소가 없으면 좌표 링크를 만든다 — 이름은 인코딩한다', () => {
    expect(kakaoMapUrl(place(), 'map')).toBe('https://map.kakao.com/link/map/%EC%B9%B4%ED%8E%98%20%EC%9D%B8%20%EC%82%AC%EC%9D%B4%EB%93%9C,37.2218,127.0749')
  })

  it('길찾기는 상세 주소가 있어도 좌표 링크를 쓴다', () => {
    expect(kakaoMapUrl(place({ placeUrl: 'http://place.map.kakao.com/123' }), 'to')).toContain('/link/to/')
  })
})

describe('formatDistance', () => {
  it('1km 미만은 m로 반올림한다', () => {
    expect(formatDistance(339.6)).toBe('340m')
  })

  it('1km 이상은 km로 소수 한 자리', () => {
    expect(formatDistance(1540)).toBe('1.5km')
  })

  it('거리가 없으면 빈 문자열', () => {
    expect(formatDistance(undefined)).toBe('')
    expect(formatDistance(0)).toBe('')
  })
})

describe('hasCoords', () => {
  it('(0,0)은 좌표 없음으로 본다', () => {
    expect(hasCoords(place({ lat: 0, lng: 0 }))).toBe(false)
    expect(hasCoords(place())).toBe(true)
  })
})
