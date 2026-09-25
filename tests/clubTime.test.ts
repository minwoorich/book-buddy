import { describe, it, expect } from 'vitest'
import { formatKst, formatKstDate, formatKstTime, kstIso } from '../shared/utils/clubTime'

describe('formatKst', () => {
  it('UTC ISO를 KST 벽시계 "M/D(요일) HH:mm"으로', () => {
    expect(formatKst('2026-09-25T10:00:00.000Z')).toBe('9/25(금) 19:00')
    expect(formatKst('2026-09-28T03:00:00.000Z')).toBe('9/28(월) 12:00')
  })
  it('날짜 경계를 KST로 넘긴다 (UTC 15:30 = 다음 날 00:30 KST)', () => {
    expect(formatKst('2026-09-25T15:30:00.000Z')).toBe('9/26(토) 00:30')
  })
  it('부분 포맷', () => {
    expect(formatKstTime('2026-09-25T10:00:00.000Z')).toBe('19:00')
    expect(formatKstDate('2026-09-25T10:00:00.000Z')).toBe('9/25(금)')
  })
})

describe('kstIso', () => {
  it('KST 벽시계를 ISO로', () => {
    expect(kstIso('2026-09-29', '18:30')).toBe('2026-09-29T09:30:00.000Z')
    expect(kstIso('2026-10-01', '12:00')).toBe('2026-10-01T03:00:00.000Z')
  })
})
