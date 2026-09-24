import { describe, it, expect } from 'vitest'
import { officeForCompany, midpointOf, VATECH_HQ, VATECH_OFFICES } from '../shared/constants/company'
import { scoreMeetingPlace, describeMeetingPlace, type PlaceScoreInput } from '../server/utils/clubPlace'

describe('officeForCompany / midpointOf', () => {
  it('회사 이름으로 사업장을 고른다 — 엠시스·이엠엑스 외는 본사', () => {
    expect(officeForCompany('바텍엠시스').key).toBe('msys')
    expect(officeForCompany('바텍이엠엑스').key).toBe('emx')
    expect(officeForCompany('바텍네트웍스').key).toBe('networks')
    expect(officeForCompany('레이언스').key).toBe('networks')
    expect(officeForCompany('바텍이우홀딩스').key).toBe('networks')
    expect(officeForCompany('').key).toBe('networks')
  })
  it('중간 지점은 좌표 평균, 빈 배열이면 본사', () => {
    const [a, b] = VATECH_OFFICES
    const mid = midpointOf([a!, b!])
    expect(mid.lat).toBeCloseTo((a!.lat + b!.lat) / 2, 6)
    expect(mid.lng).toBeCloseTo((a!.lng + b!.lng) / 2, 6)
    expect(midpointOf([])).toEqual({ lat: VATECH_HQ.lat, lng: VATECH_HQ.lng })
  })
})

function input(over: Partial<PlaceScoreInput> = {}): PlaceScoreInput {
  return { distanceM: 500, total: 0, tagCounts: {}, memberCount: 3, ...over }
}

describe('scoreMeetingPlace', () => {
  it('가까울수록 proximity가 높고 5km 밖은 0', () => {
    expect(scoreMeetingPlace(input({ distanceM: 0 })).proximity).toBe(1)
    expect(scoreMeetingPlace(input({ distanceM: 2500 })).proximity).toBeCloseTo(0.5)
    expect(scoreMeetingPlace(input({ distanceM: 9000 })).proximity).toBe(0)
    expect(scoreMeetingPlace(input({ distanceM: undefined })).proximity).toBe(0)
  })
  it('자리 넓어요·오래 있기 좋아요 비율이 점수가 된다', () => {
    const b = scoreMeetingPlace(input({ total: 4, tagCounts: { spacious: 2, 'long-stay': 4 } }))
    expect(b.spacious).toBeCloseTo(0.5)
    expect(b.longStay).toBe(1)
  })
  it('quiet는 점수에 영향이 없다 (개인 추천과의 분리)', () => {
    const a = scoreMeetingPlace(input({ total: 3, tagCounts: { quiet: 3 } }))
    const b = scoreMeetingPlace(input({ total: 3, tagCounts: {} }))
    expect(a.total).toBeCloseTo(b.total)
  })
  it('시끄러워요가 과반이면 quietness 0, 아니면 1 - 비율; 후기 없으면 1', () => {
    expect(scoreMeetingPlace(input({ total: 4, tagCounts: { noisy: 3 } })).quietness).toBe(0)
    expect(scoreMeetingPlace(input({ total: 4, tagCounts: { noisy: 1 } })).quietness).toBeCloseTo(0.75)
    expect(scoreMeetingPlace(input({ total: 0 })).quietness).toBe(1)
  })
  it('후기 수는 log 스케일로 10건에서 포화', () => {
    expect(scoreMeetingPlace(input({ total: 0 })).reviews).toBe(0)
    expect(scoreMeetingPlace(input({ total: 10 })).reviews).toBe(1)
    expect(scoreMeetingPlace(input({ total: 50 })).reviews).toBe(1)
    const three = scoreMeetingPlace(input({ total: 3 })).reviews
    expect(three).toBeGreaterThan(0.5)
    expect(three).toBeLessThan(1)
  })
  it('4명 이상이면 spacious 가중치가 0.30으로 오른다', () => {
    const small = scoreMeetingPlace(input({ total: 2, tagCounts: { spacious: 2 }, memberCount: 3 }))
    const large = scoreMeetingPlace(input({ total: 2, tagCounts: { spacious: 2 }, memberCount: 4 }))
    expect(large.total - small.total).toBeCloseTo(0.05)
  })
  it('total은 가중합이다', () => {
    const b = scoreMeetingPlace(input({ distanceM: 1000, total: 5, tagCounts: { spacious: 3, 'long-stay': 2, noisy: 1 } }))
    const expected = b.proximity * 0.3 + b.spacious * 0.25 + b.longStay * 0.2 + b.reviews * 0.15 + b.quietness * 0.1
    expect(b.total).toBeCloseTo(expected)
  })
})

describe('describeMeetingPlace', () => {
  it('거리와 태그 근거를 한 줄로', () => {
    const s = describeMeetingPlace(input({ distanceM: 850, total: 4, tagCounts: { spacious: 3, 'long-stay': 2 } }))
    expect(s).toContain('850m')
    expect(s).toContain('자리 넓어요 3')
    expect(s).toContain('후기 4개')
  })
  it('후기가 없으면 그렇다고 말한다', () => {
    expect(describeMeetingPlace(input({ distanceM: 300 }))).toContain('아직 후기가 없어요')
  })
})
