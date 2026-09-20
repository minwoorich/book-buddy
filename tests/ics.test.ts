import { describe, it, expect } from 'vitest'
import { buildIcs } from '../server/utils/ics'

const INPUT = {
  uid: 'club-7@vnlibrary.com',
  startIso: '2026-09-25T10:00:00.000Z',
  endIso: '2026-09-25T11:30:00.000Z',
  summary: '『하드씽』 책모임',
  description: '토론 질문 1. 저자의 결론, 현장에서 통할까?\n참가자: 김민우, 이서연',
  location: '스타벅스 광교점, 2층',
  stampIso: '2026-09-21T00:00:00.000Z',
}

describe('buildIcs', () => {
  it('VCALENDAR/VEVENT 골격과 UTC 시각을 담는다', () => {
    const ics = buildIcs(INPUT)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT\r\n')
    expect(ics).toContain('UID:club-7@vnlibrary.com\r\n')
    expect(ics).toContain('DTSTART:20260925T100000Z\r\n')
    expect(ics).toContain('DTEND:20260925T113000Z\r\n')
    expect(ics).toContain('DTSTAMP:20260921T000000Z\r\n')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
  it('쉼표·세미콜론·줄바꿈을 이스케이프한다', () => {
    const ics = buildIcs(INPUT)
    expect(ics).toContain('LOCATION:스타벅스 광교점\\, 2층\r\n')
    expect(ics).toContain('DESCRIPTION:토론 질문 1. 저자의 결론\\, 현장에서 통할까?\\n참가자: 김민우\\, 이서연\r\n')
  })
  it('location이 없으면 LOCATION 줄을 내지 않는다', () => {
    expect(buildIcs({ ...INPUT, location: null })).not.toContain('LOCATION:')
  })
})
