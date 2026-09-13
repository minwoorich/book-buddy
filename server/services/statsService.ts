import { getDb } from '../db/connection'
import type { StatRow } from '../../shared/types'
import type { Period } from './rankingService'

export type StatsBy = 'department' | 'gender' | 'age' | 'position' | 'company' | 'team'

export const STATS_BY_VALUES: StatsBy[] = ['department', 'gender', 'age', 'position', 'company', 'team']

const SIMPLE_COLUMN: Record<'gender' | 'position' | 'company', string> = {
  gender: 'gender',
  position: 'position',
  company: 'company',
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

interface GroupMaps {
  headCount: Map<string, number>
  loanCount: Map<string, number>
  doneCount: Map<string, number>
}

type Row = Record<string, string>

/**
 * users/loans를 `cols`(users 컬럼들) 기준으로 GROUP BY해 head/loan/done 카운트를 집계한다.
 * 회사·부서·팀처럼 상위 소속이 다르면 이름이 같아도 별개 그룹이어야 하므로,
 * 실제 GROUP BY는 항상 `cols` 전체(예: company+department)로 하고,
 * 화면에 보일 label만 `labelOf`로 압축한다(예: '회사 · 부서').
 */
function aggregateByColumns(
  db: ReturnType<typeof getDb>,
  cols: string[],
  period: Period,
  labelOf: (row: Row) => string
): GroupMaps {
  const plainCols = cols.join(', ')
  const uCols = cols.map((c) => `u.${c} as ${c}`).join(', ')
  const groupByU = cols.map((c) => `u.${c}`).join(', ')

  const headCount = new Map<string, number>()
  const loanCount = new Map<string, number>()
  const doneCount = new Map<string, number>()

  const headRows = db
    .prepare(`SELECT ${plainCols}, COUNT(*) as cnt FROM users GROUP BY ${plainCols}`)
    .all() as (Row & { cnt: number })[]
  for (const r of headRows) headCount.set(labelOf(r), (headCount.get(labelOf(r)) ?? 0) + r.cnt)

  const loanRows = db
    .prepare(
      `SELECT ${uCols}, COUNT(l.id) as cnt
       FROM loans l JOIN users u ON u.id = l.user_id
       WHERE 1=1 ${periodClause(period, 'loaned_at')}
       GROUP BY ${groupByU}`
    )
    .all() as (Row & { cnt: number })[]
  for (const r of loanRows) loanCount.set(labelOf(r), (loanCount.get(labelOf(r)) ?? 0) + r.cnt)

  const doneRows = db
    .prepare(
      `SELECT ${uCols}, COUNT(l.id) as cnt
       FROM loans l JOIN users u ON u.id = l.user_id
       WHERE l.returned_at IS NOT NULL ${periodClause(period, 'returned_at')}
       GROUP BY ${groupByU}`
    )
    .all() as (Row & { cnt: number })[]
  for (const r of doneRows) doneCount.set(labelOf(r), (doneCount.get(labelOf(r)) ?? 0) + r.cnt)

  return { headCount, loanCount, doneCount }
}

function aggregateByAge(db: ReturnType<typeof getDb>, period: Period): GroupMaps {
  const headCount = new Map<string, number>()
  const loanCount = new Map<string, number>()
  const doneCount = new Map<string, number>()

  const users = db.prepare('SELECT birth_year as birthYear FROM users').all() as { birthYear: number }[]
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

  const boundary = (db.prepare("SELECT date('now','start of month') as v").get() as { v: string }).v
  for (const l of loans) {
    const label = ageLabel(l.birthYear)
    if (period === 'all' || l.loanedAt >= boundary) {
      loanCount.set(label, (loanCount.get(label) ?? 0) + 1)
    }
    if (l.returnedAt && (period === 'all' || l.returnedAt >= boundary)) {
      doneCount.set(label, (doneCount.get(label) ?? 0) + 1)
    }
  }

  return { headCount, loanCount, doneCount }
}

export const statsService = {
  /**
   * 그룹별 통계. headCount는 loans와 무관하게 users 전체 기준,
   * loanCount는 기간 내 대출 시작 수, doneCount는 기간 내 반납 완료 수.
   * doneCount DESC 정렬.
   */
  byGroup(by: StatsBy, period: Period): StatRow[] {
    const db = getDb()

    let maps: GroupMaps
    if (by === 'age') {
      maps = aggregateByAge(db, period)
    } else if (by === 'department') {
      // 회사가 다르면 부서명이 같아도 별개 그룹이어야 하므로 company까지 GROUP BY.
      maps = aggregateByColumns(db, ['company', 'department'], period, (r) => `${r.company} · ${r.department}`)
    } else if (by === 'team') {
      // 회사·부서가 다르면 팀명이 같아도 별개 그룹이어야 하므로 GROUP BY는 셋 다 포함.
      maps = aggregateByColumns(db, ['company', 'department', 'team'], period, (r) => `${r.company} · ${r.team}`)
    } else {
      const column = SIMPLE_COLUMN[by]
      maps = aggregateByColumns(db, [column], period, (r) => r[column])
    }

    const { headCount, loanCount, doneCount } = maps
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
