import { getDb } from '../db/connection'
import type { RankRow } from '../../shared/types'

export type RankBy = 'user' | 'team' | 'department' | 'company'
export type Period = 'month' | 'all'

export const RANK_BY_VALUES: RankBy[] = ['user', 'team', 'department', 'company']
export const PERIOD_VALUES: Period[] = ['month', 'all']

interface UserRankRow {
  id: number
  label: string
  company: string
  department: string
  position: string
  cnt: number
}

interface GroupRankRow {
  label: string
  company?: string
  department?: string
  cnt: number
}

/**
 * team/department는 회사·부서가 다르면 이름이 같아도 별개 그룹이어야 하므로
 * 상위 소속 컬럼까지 포함해 GROUP BY한다(예: 레이언스/연구소 vs 바텍/연구소).
 */
const GROUP_CONFIG: Record<'team' | 'department' | 'company', { groupBy: string; select: string }> = {
  team: {
    groupBy: 'u.company, u.department, u.team',
    select: 'u.team as label, u.company as company, u.department as department',
  },
  department: {
    groupBy: 'u.company, u.department',
    select: 'u.department as label, u.company as company',
  },
  company: {
    groupBy: 'u.company',
    select: 'u.company as label',
  },
}

/** period='month'면 이번 달 1일 0시 이후 반납분만, 'all'이면 전체. */
function periodClause(period: Period): string {
  return period === 'month' ? "AND l.returned_at >= date('now','start of month')" : ''
}

export const rankingService = {
  /** 반납 완료(loans.returned_at IS NOT NULL) 기준 랭킹. count DESC 정렬, 0권인 대상은 제외. */
  rank(by: RankBy, period: Period): RankRow[] {
    const db = getDb()
    const where = `l.returned_at IS NOT NULL ${periodClause(period)}`

    if (by === 'user') {
      const rows = db
        .prepare(
          `SELECT u.id as id, u.name as label, u.company as company, u.department as department,
                  u.position as position, COUNT(l.id) as cnt
           FROM loans l JOIN users u ON u.id = l.user_id
           WHERE ${where}
           GROUP BY u.id
           ORDER BY cnt DESC`
        )
        .all() as UserRankRow[]

      return rows.map((r) => ({
        key: String(r.id),
        label: r.label,
        sub: `${r.company} · ${r.department} · ${r.position}`,
        count: r.cnt,
        userId: r.id,
      }))
    }

    const { groupBy, select } = GROUP_CONFIG[by]
    const rows = db
      .prepare(
        `SELECT ${select}, COUNT(l.id) as cnt
         FROM loans l JOIN users u ON u.id = l.user_id
         WHERE ${where}
         GROUP BY ${groupBy}
         ORDER BY cnt DESC`
      )
      .all() as GroupRankRow[]

    return rows.map((r) => {
      if (by === 'team') {
        return {
          key: `${r.company}/${r.department}/${r.label}`,
          label: r.label,
          sub: `${r.company} · ${r.department}`,
          count: r.cnt,
        }
      }
      if (by === 'department') {
        return {
          key: `${r.company}/${r.label}`,
          label: r.label,
          sub: r.company,
          count: r.cnt,
        }
      }
      return { key: r.label, label: r.label, count: r.cnt }
    })
  },
}
