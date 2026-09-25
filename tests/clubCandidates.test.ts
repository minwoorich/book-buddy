import { describe, it, expect } from 'vitest'
import { normalizeSlots, remapVotes, pickByVotes, CANDIDATE_MAX } from '../server/utils/clubCandidates'
import { ApiError } from '../server/utils/errors'

const NOW = new Date('2026-09-25T00:00:00Z')   // 9/25 09:00 KST

describe('normalizeSlots', () => {
  it('정렬·중복 제거·밀리초 정규화', () => {
    const out = normalizeSlots(['2026-10-01T09:30:00Z', '2026-09-29T09:30:00.000Z', '2026-10-01T09:30:00.000Z'], NOW)
    expect(out).toEqual(['2026-09-29T09:30:00.000Z', '2026-10-01T09:30:00.000Z'])
  })
  it('빈 배열은 빈 배열', () => { expect(normalizeSlots([], NOW)).toEqual([]) })
  it('배열이 아니거나 문자열이 아니면 400', () => {
    expect(() => normalizeSlots('x', NOW)).toThrow(ApiError)
    expect(() => normalizeSlots([1], NOW)).toThrow(ApiError)
  })
  it(`${CANDIDATE_MAX}개 초과 400`, () => {
    const many = Array.from({ length: CANDIDATE_MAX + 1 }, (_, i) => `2026-10-0${i + 1}T09:30:00Z`)
    expect(() => normalizeSlots(many, NOW)).toThrow(/5개/)
  })
  it('지난 시각·30분 단위 아님·파싱 불가 400', () => {
    expect(() => normalizeSlots(['2026-09-24T09:30:00Z'], NOW)).toThrow(/지난/)
    expect(() => normalizeSlots(['2026-10-01T09:20:00Z'], NOW)).toThrow(/30분/)
    expect(() => normalizeSlots(['nope'], NOW)).toThrow(ApiError)
  })
})

describe('remapVotes', () => {
  const A = '2026-09-29T09:30:00.000Z', B = '2026-10-01T09:30:00.000Z', C = '2026-10-02T09:30:00.000Z'
  it('남은 후보의 표는 새 인덱스로, 사라진 후보의 표는 버린다', () => {
    const votes = [{ userId: 1, slotIdx: 0 }, { userId: 1, slotIdx: 1 }, { userId: 2, slotIdx: 1 }]
    expect(remapVotes([A, B], [B, C], votes)).toEqual([{ userId: 1, slotIdx: 0 }, { userId: 2, slotIdx: 0 }])
  })
  it('후보가 그대로면 표도 그대로', () => {
    const votes = [{ userId: 3, slotIdx: 1 }]
    expect(remapVotes([A, B], [A, B], votes)).toEqual(votes)
  })
})

describe('pickByVotes', () => {
  const past = '2026-09-24T09:30:00.000Z', A = '2026-09-29T09:30:00.000Z', B = '2026-10-01T09:30:00.000Z'
  it('최다 득표', () => {
    expect(pickByVotes([A, B], [{ userId: 1, slotIdx: 1 }, { userId: 2, slotIdx: 1 }, { userId: 3, slotIdx: 0 }], NOW)).toBe(B)
  })
  it('동점·무표는 가장 이른 것, 지난 후보는 제외', () => {
    expect(pickByVotes([past, A, B], [], NOW)).toBe(A)
    expect(pickByVotes([past, A, B], [{ userId: 1, slotIdx: 0 }, { userId: 2, slotIdx: 0 }], NOW)).toBe(A)
  })
  it('미래 후보가 없으면 null', () => { expect(pickByVotes([past], [{ userId: 1, slotIdx: 0 }], NOW)).toBeNull() })
})
