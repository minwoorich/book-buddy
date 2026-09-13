import { getDb } from '../db/connection'
import type { StatRow } from '../../shared/types'
import type { Period } from './rankingService'

export type StatsBy = 'department' | 'gender' | 'age' | 'position' | 'company' | 'team'

export const STATS_BY_VALUES: StatsBy[] = ['department', 'gender', 'age', 'position', 'company', 'team']

const COLUMN: Record<Exclude<StatsBy, 'age'>, string> = {
  department: 'department',
  gender: 'gender',
  position: 'position',
  company: 'company',
  team: 'team',
}

/** period='month'면 이번 달 1일 0시 이후, 'all'이면 전체. column은 loaned_at 또는 returned_at. */
function periodClause(period: Period, column: 'loaned_at' | 'returned_at'): string {
  return period === 'month' ? `AND l.${column} >= date('now','start of month')` : ''
}

/** (현재연도 - 출생연도)를 10으로 내림한 나이대. 50대 이상은 전부 '50대+'. */
function ageLabel(birthYear: number, now = new Date().getFullYear()): string {
  const decade = Math.floor((now - birthYear) / 10) * 10
  return decade >= 50 ? '50대+' : `${decade}대`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

interface GroupCount {
  label: string
  cnt: number
}

export const statsService = {
  /**
   * 그룹별 통계. headCount는 loans와 무관하게 users 전체 기준,
   * loanCount는 기간 내 대출 시작 수, doneCount는 기간 내 반납 완료 수.
   * doneCount DESC 정렬.
   */
  byGroup(by: StatsBy, period: Period): StatRow[] {
    const db = getDb()

    const headCount = new Map<string, number>()
    const loanCount = new Map<string, number>()
    const doneCount = new Map<string, number>()

    if (by === 'age') {
      const users = db.prepare('SELECT birth_year as birthYear FROM users').all() as {
        birthYear: number
      }[]
      for (const u of users) {
        const label = ageLabel(u.birthYear)
        headCount.set(label, (headCount.get(label) ?? 0) + 1)
      }

      const loans = db
        .prepare(
          `SELECT u.birth_year as birthYear, l.loaned_at as loanedAt, l.returned_at as returnedAt
           FROM loans l JOIN users u ON u.id = l.user_id`
        )
        .all() as { birthYear: number; loanedAt: string; returnedAt: string | null }[]

      const monthStart = db.prepare("SELECT date('now','start of month') as v").get() as { v: string }
      const boundary = monthStart.v
      for (const l of loans) {
        const label = ageLabel(l.birthYear)
        if (period === 'all' || l.loanedAt >= boundary) {
          loanCount.set(label, (loanCount.get(label) ?? 0) + 1)
        }
        if (l.returnedAt && (period === 'all' || l.returnedAt >= boundary)) {
          doneCount.set(label, (doneCount.get(label) ?? 0) + 1)
        }
      }
    } else {
      const column = COLUMN[by]

      const headRows = db
        .prepare(`SELECT ${column} as label, COUNT(*) as cnt FROM users GROUP BY ${column}`)
        .all() as GroupCount[]
      for (const r of headRows) headCount.set(r.label, r.cnt)

      const loanRows = db
        .prepare(
          `SELECT u.${column} as label, COUNT(l.id) as cnt
           FROM loans l JOIN users u ON u.id = l.user_id
           WHERE 1=1 ${periodClause(period, 'loaned_at')}
           GROUP BY u.${column}`
        )
        .all() as GroupCount[]
      for (const r of loanRows) loanCount.set(r.label, r.cnt)

      const doneRows = db
        .prepare(
          `SELECT u.${column} as label, COUNT(l.id) as cnt
           FROM loans l JOIN users u ON u.id = l.user_id
           WHERE l.returned_at IS NOT NULL ${periodClause(period, 'returned_at')}
           GROUP BY u.${column}`
        )
        .all() as GroupCount[]
      for (const r of doneRows) doneCount.set(r.label, r.cnt)
    }

    const rows: StatRow[] = [...headCount.entries()].map(([label, head]) => {
      const done = doneCount.get(label) ?? 0
      return {
        label,
        loanCount: loanCount.get(label) ?? 0,
        doneCount: done,
        headCount: head,
        perHead: head > 0 ? round1(done / head) : 0,
      }
    })

    rows.sort((a, b) => b.doneCount - a.doneCount)
    return rows
  },
}
