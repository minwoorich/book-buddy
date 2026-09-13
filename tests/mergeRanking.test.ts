import { describe, it, expect } from 'vitest'
import { mergeRanking } from '../server/services/naverPlaceService'
import type { Place } from '../shared/types'

function place(name: string): Place {
  return { name, category: '카페', address: '용인 수지구', mapx: 1270000000, mapy: 373000000, lat: 37.3, lng: 127 }
}

describe('mergeRanking', () => {
  it('1. name 매칭 순서대로 재배열하고 reason을 붙인다', () => {
    const places = [place('카페 온점'), place('수지도서관'), place('동천 공원')]
    const ranked = [
      { name: '동천 공원', reason: '산책 좋아요.' },
      { name: '카페 온점', reason: '조용해요.' },
      { name: '수지도서관', reason: '집중 잘 돼요.' },
    ]
    const result = mergeRanking(places, ranked)
    expect(result.map((p) => p.name)).toEqual(['동천 공원', '카페 온점', '수지도서관'])
    expect(result.map((p) => p.reason)).toEqual(['산책 좋아요.', '조용해요.', '집중 잘 돼요.'])
  })

  it('2. ranked에 없거나 매칭 실패한 장소는 원 순서 그대로 뒤에 붙고 reason은 빈 문자열이다', () => {
    const places = [place('카페 온점'), place('수지도서관'), place('동천 공원')]
    const ranked = [
      { name: '수지도서관', reason: '집중 잘 돼요.' },
      { name: '존재하지 않는 장소', reason: '무시돼야 함' },
    ]
    const result = mergeRanking(places, ranked)
    expect(result.map((p) => p.name)).toEqual(['수지도서관', '카페 온점', '동천 공원'])
    expect(result.map((p) => p.reason)).toEqual(['집중 잘 돼요.', '', ''])
  })

  it('3. AI가 같은 name을 중복 반환해도 처음 1회만 사용한다', () => {
    const places = [place('카페 온점'), place('수지도서관')]
    const ranked = [
      { name: '카페 온점', reason: '첫 번째 이유' },
      { name: '카페 온점', reason: '중복된 두 번째 이유(무시돼야 함)' },
      { name: '수지도서관', reason: '두 번째 장소 이유' },
    ]
    const result = mergeRanking(places, ranked)
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.name)).toEqual(['카페 온점', '수지도서관'])
    expect(result[0]?.reason).toBe('첫 번째 이유')
    expect(result[1]?.reason).toBe('두 번째 장소 이유')
  })
})
