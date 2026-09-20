import { describe, it, expect } from 'vitest'
import {
  generateCandidateSlots, kstDate, kstParts, nextWeekMondayKst, slotDurationMinutes, slotEndIso,
} from '../server/utils/clubSlots'

// 2026-09-21(월) 09:00 KST = 00:00Z
const MON = new Date('2026-09-21T00:00:00Z')

describe('kst helpers', () => {
  it('kstDate는 KST 벽시계를 UTC로 바꾼다', () => {
    expect(kstDate(2026, 9, 25, 19, 0).toISOString()).toBe('2026-09-25T10:00:00.000Z')
  })
  it('kstParts는 UTC를 KST 벽시계로 푼다', () => {
    expect(kstParts(new Date('2026-09-25T10:00:00Z'))).toEqual({ y: 2026, m: 9, d: 25, weekday: 5, h: 19, min: 0 })
  })
  it('nextWeekMondayKst: 월요일 아침이면 다음 주 월요일', () => {
    expect(nextWeekMondayKst(MON).toISOString()).toBe(kstDate(2026, 9, 28, 0, 0).toISOString())
  })
  it('nextWeekMondayKst: 다음 월요일까지 3일이 안 남았으면 그다음 주', () => {
    const sat = new Date('2026-09-26T03:00:00Z') // 토 12:00 KST → 다음 월(28일)까지 1.5일
    expect(nextWeekMondayKst(sat).toISOString()).toBe(kstDate(2026, 10, 5, 0, 0).toISOString())
  })
  it('slotDurationMinutes: 점심 60분, 저녁 90분', () => {
    expect(slotDurationMinutes('2026-09-28T03:00:00.000Z')).toBe(60)
    expect(slotDurationMinutes('2026-09-28T09:30:00.000Z')).toBe(90)
    expect(slotEndIso('2026-09-28T09:30:00.000Z')).toBe('2026-09-28T11:00:00.000Z')
  })
})

describe('generateCandidateSlots', () => {
  const base = { now: MON, busy: [], mustEndBefore: null, preferEvening: false }

  it('다음 주 평일 슬롯 3개를 시간순으로 준다', () => {
    const slots = generateCandidateSlots(base)
    expect(slots).toHaveLength(3)
    expect([...slots].sort()).toEqual(slots)
    for (const s of slots) {
      const p = kstParts(new Date(s))
      expect(p.weekday).toBeGreaterThanOrEqual(1)
      expect(p.weekday).toBeLessThanOrEqual(5)
      expect(p.d).toBeGreaterThanOrEqual(28)
      expect([`${p.h}:${p.min}`]).toEqual(expect.arrayContaining([expect.stringMatching(/^(12:0|18:30)$/)]))
    }
  })

  it('저녁 우선이면 세 개 모두 저녁이다', () => {
    const slots = generateCandidateSlots({ ...base, preferEvening: true })
    expect(slots.every((s) => kstParts(new Date(s)).h === 18)).toBe(true)
  })

  it('다른 모임과 겹치는 시간은 제외한다', () => {
    const monLunch = kstDate(2026, 9, 28, 12, 0).toISOString()
    const slots = generateCandidateSlots({
      ...base,
      busy: [{ start: kstDate(2026, 9, 28, 12, 30).toISOString(), end: kstDate(2026, 9, 28, 13, 30).toISOString() }],
    })
    expect(slots).not.toContain(monLunch)
  })

  it('반납 예정일 이후 슬롯은 제외한다', () => {
    const slots = generateCandidateSlots({ ...base, mustEndBefore: kstDate(2026, 9, 29, 0, 0).toISOString() })
    expect(slots.every((s) => new Date(slotEndIso(s)) <= kstDate(2026, 9, 29, 0, 0))).toBe(true)
    expect(slots.length).toBeGreaterThan(0)
  })

  it('가능한 시간이 없으면 빈 배열', () => {
    const slots = generateCandidateSlots({ ...base, mustEndBefore: kstDate(2026, 9, 28, 0, 0).toISOString() })
    expect(slots).toEqual([])
  })
})
