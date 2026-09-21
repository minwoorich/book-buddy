import { describe, it, expect } from 'vitest'
import { buildCalendarEvents } from '../app/utils/calendarEvents'
import type { Book, Club, Loan } from '../shared/types'

const book: Book = { id: 1, isbn13: null, title: '하드씽', author: 'a', publisher: null, category: '경제경영', description: null, coverUrl: null, pubDate: null, pageCount: null }
function loan(over: Partial<Loan>): Loan & { book: Book } {
  return { id: 1, bookId: 1, userId: 1, loanedAt: '2026-09-01 00:00:00', dueAt: '2026-09-30T00:00:00.000Z', returnedAt: null, book, ...over }
}
function club(over: Partial<Club>): Club {
  return {
    id: 1, bookId: 1, bookTitle: '하드씽', bookCoverUrl: null, status: 'confirmed', agenda: [], matchScore: 0, matchReason: '',
    candidateSlots: [], meetAt: null, inviteExpiresAt: null, voteExpiresAt: null, place: null, placeDecidedAt: null,
    createdAt: '2026-09-20 00:00:00', canceledReason: null, doneAt: null, votes: [], members: [], ...over,
  }
}

describe('buildCalendarEvents', () => {
  it('완독은 returnedAt(DB 포맷)을 UTC로 해석한다', () => {
    const ev = buildCalendarEvents({ doneLoans: [loan({ returnedAt: '2026-09-20 15:30:00' })], activeLoans: [], clubs: [] })
    expect(ev).toHaveLength(1)
    expect(ev[0]?.kind).toBe('done')
    expect(ev[0]?.at.toISOString()).toBe('2026-09-20T15:30:00.000Z')
  })
  it('대출 중인 책은 반납 예정 이벤트가 된다', () => {
    const ev = buildCalendarEvents({ doneLoans: [], activeLoans: [loan({})], clubs: [] })
    expect(ev[0]).toMatchObject({ kind: 'due' })
    expect(ev[0]?.at.toISOString()).toBe('2026-09-30T00:00:00.000Z')
  })
  it('확정 모임은 실선 1개, 조율 중 모임은 후보마다 점선', () => {
    const ev = buildCalendarEvents({
      doneLoans: [], activeLoans: [],
      clubs: [
        club({ id: 1, meetAt: '2026-09-25T10:00:00.000Z', place: { kakaoId: 'k', name: '스타벅스', lat: 0, lng: 0 } }),
        club({ id: 2, status: 'scheduling', candidateSlots: ['2026-09-28T03:00:00.000Z', '2026-09-29T09:30:00.000Z'] }),
      ],
    })
    const clubs = ev.filter((e) => e.kind === 'club')
    expect(clubs).toHaveLength(3)
    expect(clubs[0]).toMatchObject({ clubId: 1, tentative: false, time: '19:00', place: '스타벅스' })
    expect(clubs.filter((e) => e.kind === 'club' && e.tentative)).toHaveLength(2)
  })
  it('취소·종료 모임은 넣지 않는다', () => {
    const ev = buildCalendarEvents({ doneLoans: [], activeLoans: [], clubs: [club({ status: 'canceled', meetAt: '2026-09-25T10:00:00.000Z' })] })
    expect(ev).toHaveLength(0)
  })
})
