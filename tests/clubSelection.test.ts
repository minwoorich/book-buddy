import { describe, it, expect } from 'vitest'
import { selectMembers, pickHost, passesQuota, type QuotaState } from '../server/utils/clubSelection'
import type { CandidateReader } from '../server/utils/clubMatch'

const NOW = new Date('2026-09-20T00:00:00Z')

function reader(over: Partial<CandidateReader> & { userId: number }): CandidateReader {
  return {
    department: '개발본부',
    returnedAt: '2026-09-10T00:00:00Z',
    rating: null,
    lastClubAt: null,
    ...over,
  }
}

function emptyQuota(): QuotaState {
  return { busyUserIds: new Set(), cooledUserIds: new Set(), recentBookIds: new Set() }
}

describe('selectMembers', () => {
  it('5명 이하면 전원을 그대로 쓴다', () => {
    const rs = [reader({ userId: 1 }), reader({ userId: 2 }), reader({ userId: 3 })]
    expect(selectMembers(rs, NOW).map((r) => r.userId)).toEqual([1, 2, 3])
  })

  it('6명 이상이면 5명으로 자른다', () => {
    const rs = [1, 2, 3, 4, 5, 6, 7].map((id) => reader({ userId: id }))
    expect(selectMembers(rs, NOW)).toHaveLength(5)
  })

  it('자를 때 부서 다양성을 먼저 확보한다', () => {
    const rs = [
      reader({ userId: 1, department: '개발본부' }),
      reader({ userId: 2, department: '개발본부' }),
      reader({ userId: 3, department: '개발본부' }),
      reader({ userId: 4, department: '개발본부' }),
      reader({ userId: 5, department: '개발본부' }),
      reader({ userId: 6, department: '영업본부' }),
      reader({ userId: 7, department: '연구소' }),
    ]
    const picked = selectMembers(rs, NOW)
    expect(new Set(picked.map((r) => r.department)).size).toBe(3)
  })

  it('리뷰를 쓴 사람이 리뷰 없는 사람보다 먼저 뽑힌다', () => {
    const rs = [
      reader({ userId: 1, rating: null }),
      reader({ userId: 2, rating: null }),
      reader({ userId: 3, rating: null }),
      reader({ userId: 4, rating: null }),
      reader({ userId: 5, rating: null }),
      reader({ userId: 6, rating: 4 }),
    ]
    expect(selectMembers(rs, NOW).map((r) => r.userId)).toContain(6)
  })

  it('같은 조건이면 모임 이력이 없는 사람이 먼저 뽑힌다', () => {
    const rs = [
      reader({ userId: 1, lastClubAt: '2026-09-01T00:00:00Z' }),
      reader({ userId: 2, lastClubAt: '2026-09-01T00:00:00Z' }),
      reader({ userId: 3, lastClubAt: '2026-09-01T00:00:00Z' }),
      reader({ userId: 4, lastClubAt: '2026-09-01T00:00:00Z' }),
      reader({ userId: 5, lastClubAt: '2026-09-01T00:00:00Z' }),
      reader({ userId: 6, lastClubAt: null }),
    ]
    expect(selectMembers(rs, NOW).map((r) => r.userId)).toContain(6)
  })
})

describe('pickHost', () => {
  it('리뷰를 쓴 사람 중 모임 이력이 가장 많은(=최근인) 사람을 고른다', () => {
    const rs = [
      reader({ userId: 1, rating: null, lastClubAt: '2026-09-01T00:00:00Z' }),
      reader({ userId: 2, rating: 5, lastClubAt: '2026-08-01T00:00:00Z' }),
      reader({ userId: 3, rating: 3, lastClubAt: '2026-09-05T00:00:00Z' }),
    ]
    expect(pickHost(rs)?.userId).toBe(3)
  })

  it('리뷰 쓴 사람이 없으면 가장 먼저 완독한 사람을 고른다', () => {
    const rs = [
      reader({ userId: 1, returnedAt: '2026-09-15T00:00:00Z' }),
      reader({ userId: 2, returnedAt: '2026-09-02T00:00:00Z' }),
    ]
    expect(pickHost(rs)?.userId).toBe(2)
  })

  it('빈 배열이면 undefined', () => {
    expect(pickHost([])).toBeUndefined()
  })
})

describe('passesQuota', () => {
  it('아무 제약이 없으면 통과한다', () => {
    const rs = [reader({ userId: 1 }), reader({ userId: 2 }), reader({ userId: 3 })]
    expect(passesQuota(10, rs, emptyQuota())).toBe(true)
  })

  it('3명 미만이면 탈락한다', () => {
    expect(passesQuota(10, [reader({ userId: 1 }), reader({ userId: 2 })], emptyQuota())).toBe(false)
  })

  it('최근 3개월 안에 같은 책으로 모임이 열렸으면 탈락한다', () => {
    const rs = [reader({ userId: 1 }), reader({ userId: 2 }), reader({ userId: 3 })]
    const state = { ...emptyQuota(), recentBookIds: new Set([10]) }
    expect(passesQuota(10, rs, state)).toBe(false)
    expect(passesQuota(11, rs, state)).toBe(true)
  })

  it('진행 중 모임이 있는 사람이 빠지고도 3명이면 통과한다', () => {
    const rs = [reader({ userId: 1 }), reader({ userId: 2 }), reader({ userId: 3 }), reader({ userId: 4 })]
    const state = { ...emptyQuota(), busyUserIds: new Set([4]) }
    expect(passesQuota(10, rs, state)).toBe(true)
  })

  it('쿨다운 중인 사람을 빼면 3명이 안 되면 탈락한다', () => {
    const rs = [reader({ userId: 1 }), reader({ userId: 2 }), reader({ userId: 3 })]
    const state = { ...emptyQuota(), cooledUserIds: new Set([3]) }
    expect(passesQuota(10, rs, state)).toBe(false)
  })
})
