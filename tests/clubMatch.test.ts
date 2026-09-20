import { describe, it, expect } from 'vitest'
import { scoreCandidate, describeMatch, type CandidateReader } from '../server/utils/clubMatch'

const NOW = new Date('2026-09-20T00:00:00Z')

function reader(over: Partial<CandidateReader> & { userId: number }): CandidateReader {
  return {
    department: '개발본부',
    returnedAt: '2026-09-10T00:00:00Z',
    rating: 4,
    lastClubAt: null,
    ...over,
  }
}

describe('scoreCandidate', () => {
  it('별점이 갈릴수록 ratingSpread가 높다', () => {
    const agreed = [reader({ userId: 1, rating: 5 }), reader({ userId: 2, rating: 5 }), reader({ userId: 3, rating: 5 })]
    const split = [reader({ userId: 1, rating: 5 }), reader({ userId: 2, rating: 2 }), reader({ userId: 3, rating: 5 })]

    expect(scoreCandidate(split, NOW).ratingSpread).toBeGreaterThan(scoreCandidate(agreed, NOW).ratingSpread)
  })

  it('리뷰가 하나도 없으면 ratingSpread는 0이다 (추정하지 않는다)', () => {
    const noReviews = [
      reader({ userId: 1, rating: null }),
      reader({ userId: 2, rating: null }),
      reader({ userId: 3, rating: null }),
    ]
    expect(scoreCandidate(noReviews, NOW).ratingSpread).toBe(0)
    expect(scoreCandidate(noReviews, NOW).reviewDensity).toBe(0)
  })

  it('리뷰가 한 명뿐이면 분산을 낼 수 없으므로 ratingSpread는 0이다', () => {
    const one = [
      reader({ userId: 1, rating: 5 }),
      reader({ userId: 2, rating: null }),
      reader({ userId: 3, rating: null }),
    ]
    expect(scoreCandidate(one, NOW).ratingSpread).toBe(0)
    expect(scoreCandidate(one, NOW).reviewDensity).toBeCloseTo(1 / 3)
  })

  it('완독 시점이 비슷할수록 concurrency가 높다', () => {
    const together = [
      reader({ userId: 1, returnedAt: '2026-09-10T00:00:00Z' }),
      reader({ userId: 2, returnedAt: '2026-09-11T00:00:00Z' }),
      reader({ userId: 3, returnedAt: '2026-09-12T00:00:00Z' }),
    ]
    const scattered = [
      reader({ userId: 1, returnedAt: '2026-07-25T00:00:00Z' }),
      reader({ userId: 2, returnedAt: '2026-08-20T00:00:00Z' }),
      reader({ userId: 3, returnedAt: '2026-09-18T00:00:00Z' }),
    ]
    expect(scoreCandidate(together, NOW).concurrency).toBeGreaterThan(scoreCandidate(scattered, NOW).concurrency)
  })

  it('부서가 섞일수록 deptDiversity가 높다', () => {
    const same = [
      reader({ userId: 1, department: '개발본부' }),
      reader({ userId: 2, department: '개발본부' }),
      reader({ userId: 3, department: '개발본부' }),
    ]
    const mixed = [
      reader({ userId: 1, department: '개발본부' }),
      reader({ userId: 2, department: '영업본부' }),
      reader({ userId: 3, department: '연구소' }),
    ]
    expect(scoreCandidate(same, NOW).deptDiversity).toBeCloseTo(1 / 3)
    expect(scoreCandidate(mixed, NOW).deptDiversity).toBe(1)
  })

  it('최근 90일간 모임 이력이 없는 사람이 많을수록 newcomerBonus가 높다', () => {
    const veterans = [
      reader({ userId: 1, lastClubAt: '2026-09-01T00:00:00Z' }),
      reader({ userId: 2, lastClubAt: '2026-09-02T00:00:00Z' }),
      reader({ userId: 3, lastClubAt: '2026-09-03T00:00:00Z' }),
    ]
    const newcomers = [reader({ userId: 1 }), reader({ userId: 2 }), reader({ userId: 3 })]
    expect(scoreCandidate(veterans, NOW).newcomerBonus).toBe(0)
    expect(scoreCandidate(newcomers, NOW).newcomerBonus).toBe(1)
  })

  it('90일보다 오래된 모임 이력은 미참여로 본다', () => {
    const long = [
      reader({ userId: 1, lastClubAt: '2026-01-01T00:00:00Z' }),
      reader({ userId: 2, lastClubAt: '2026-01-01T00:00:00Z' }),
      reader({ userId: 3, lastClubAt: '2026-01-01T00:00:00Z' }),
    ]
    expect(scoreCandidate(long, NOW).newcomerBonus).toBe(1)
  })

  it('total은 0~1 사이이고 각 항목의 가중합이다', () => {
    const rs = [reader({ userId: 1, rating: 5 }), reader({ userId: 2, rating: 2, department: '영업본부' }), reader({ userId: 3, rating: 3, department: '연구소' })]
    const b = scoreCandidate(rs, NOW)
    const expected =
      b.ratingSpread * 0.25 + b.concurrency * 0.25 + b.reviewDensity * 0.2 + b.deptDiversity * 0.15 + b.newcomerBonus * 0.15
    expect(b.total).toBeCloseTo(expected)
    expect(b.total).toBeGreaterThanOrEqual(0)
    expect(b.total).toBeLessThanOrEqual(1)
  })

  it('빈 배열이면 전부 0이다', () => {
    expect(scoreCandidate([], NOW).total).toBe(0)
  })
})

describe('describeMatch', () => {
  it('별점이 갈린 조합이면 그 사실을 문구에 담는다', () => {
    const rs = [reader({ userId: 1, rating: 5 }), reader({ userId: 2, rating: 2 }), reader({ userId: 3, rating: 4, department: '연구소' })]
    const text = describeMatch(rs, scoreCandidate(rs, NOW))
    expect(text).toContain('별점')
    expect(text).toContain('부서')
  })
})
