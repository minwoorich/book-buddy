import type { Book, Club, Loan } from '#shared/types'
import { formatKstTime } from '#shared/utils/clubTime'
import { clubTitle } from '#shared/utils/clubTitle'
import { parseDbDate } from './date'

export type LoanWithBook = Loan & { book: Book }

/** 독서 달력 한 칸에 꽂히는 것들. 완독(과거)·반납 예정(미래)·모임(미래, 확정/후보). */
export type CalendarEvent =
  | { kind: 'done'; at: Date; loan: LoanWithBook }
  | { kind: 'due'; at: Date; loan: LoanWithBook }
  | { kind: 'club'; at: Date; clubId: number; title: string; time: string; place: string | null; tentative: boolean }

/**
 * 달력이 그릴 이벤트를 한 배열로 만든다. 날짜 매칭은 달력이 한다 — 여기서는 시각만 정확히 푼다:
 * returned_at은 DB 기본값(datetime('now'))이라 parseDbDate, due_at·meet_at·후보 슬롯은 앱이 ISO로 쓴 값.
 */
export function buildCalendarEvents(input: {
  doneLoans: LoanWithBook[]
  activeLoans: LoanWithBook[]
  clubs: Club[]
}): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const l of input.doneLoans) {
    if (l.returnedAt) out.push({ kind: 'done', at: parseDbDate(l.returnedAt), loan: l })
  }
  for (const l of input.activeLoans) {
    if (!l.returnedAt) out.push({ kind: 'due', at: new Date(l.dueAt), loan: l })
  }
  for (const c of input.clubs) {
    if (c.status === 'confirmed' && c.meetAt) {
      out.push({ kind: 'club', at: new Date(c.meetAt), clubId: c.id, title: clubTitle(c), time: formatKstTime(c.meetAt), place: c.place?.name ?? null, tentative: false })
    } else if (c.status === 'scheduling') {
      for (const s of c.candidateSlots) {
        out.push({ kind: 'club', at: new Date(s), clubId: c.id, title: clubTitle(c), time: formatKstTime(s), place: null, tentative: true })
      }
    }
  }
  return out
}
