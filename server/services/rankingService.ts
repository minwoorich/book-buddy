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
  reached_at: string | null
}

interface GroupRankRow {
  label: string
  company?: string
  department?: string
  cnt: number
  reached_at: string | null
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

/** 랭킹 갱신 주기(QA #56) — 30분마다 스냅샷을 새로 뜬다. */
export const RANK_REFRESH_MS = 30 * 60 * 1000

export interface RankSnapshot {
  rows: RankRow[]
  /** 이 스냅샷이 집계된 시각(30분 경계, ISO). */
  updatedAt: string
  /** 다음 갱신 예정 시각(ISO). */
  nextUpdateAt: string
}

/**
 * 30분 단위 스냅샷 캐시. 키는 `by:period`, 값은 어느 30분 구간(bucket)의 결과인지와 함께
 * 저장해 구간이 바뀌면 자연히 무효화된다. 리시드처럼 데이터가 통째로 바뀌는 경우는
 * invalidate()로 즉시 비운다.
 */
const snapshotCache = new Map<string, { bucket: number; rows: RankRow[] }>()

function currentBucket(now: number): number {
  return Math.floor(now / RANK_REFRESH_MS)
}

export const rankingService = {
  /**
   * 30분 스냅샷 랭킹(QA #56). 같은 30분 구간 안에서는 첫 조회 결과를 재사용해 "정각·30분마다
   * 갱신"이 보장되고, 화면엔 마지막/다음 갱신 시각을 보여줄 수 있다.
   */
  snapshot(by: RankBy, period: Period, now = Date.now()): RankSnapshot {
    const bucket = currentBucket(now)
    const key = `${by}:${period}`
    const cached = snapshotCache.get(key)
    const rows = cached && cached.bucket === bucket ? cached.rows : this.rank(by, period)
    if (!cached || cached.bucket !== bucket) snapshotCache.set(key, { bucket, rows })
    return {
      rows,
      updatedAt: new Date(bucket * RANK_REFRESH_MS).toISOString(),
      nextUpdateAt: new Date((bucket + 1) * RANK_REFRESH_MS).toISOString(),
    }
  },

  /** 스냅샷 캐시를 비운다(리시드 등 데이터가 통째로 바뀔 때). */
  invalidate(): void {
    snapshotCache.clear()
  },

  /**
   * 이달의 다독왕 상위 n명(리뷰 모아보기 뱃지·필터용). 랭킹 페이지의 개인·이달 순위를
   * 그대로 쓰므로 두 화면의 "다독왕"이 어긋나지 않는다.
   * 권수와 달성 시각이 모두 같을 때만 공동 순위가 된다(QA #93과 같은 규칙).
   */
  topReaders(limit = 3): { userId: number; rank: number }[] {
    const rows = this.snapshot('user', 'month').rows.slice(0, limit)
    const ranks: number[] = []
    for (let i = 0; i < rows.length; i++) {
      const prev = rows[i - 1]
      const tied = !!prev && prev.count === rows[i]!.count && (prev.reachedAt ?? null) === (rows[i]!.reachedAt ?? null)
      ranks.push(tied ? ranks[i - 1]! : i + 1)
    }
    return rows.map((row, i) => ({ userId: row.userId!, rank: ranks[i]! }))
  },

  /**
   * 반납 완료(loans.returned_at IS NOT NULL) 기준 랭킹. count DESC 정렬, 0권인 대상은 제외.
   *
   * 권수가 같을 때는 "그 권수를 먼저 채운 쪽"이 앞선다(QA #93). 집계 구간 안에서
   * n권째 완독 시각 = 그 n건의 returned_at 중 가장 늦은 값이므로 MAX(returned_at)을
   * 두 번째 정렬키(오름차순)로 쓴다. 화면에는 reachedAt으로 내려보낸다.
   */
  rank(by: RankBy, period: Period): RankRow[] {
    const db = getDb()
    const where = `l.returned_at IS NOT NULL ${periodClause(period)}`

    if (by === 'user') {
      const rows = db
        .prepare(
          `SELECT u.id as id, u.name as label, u.company as company, u.department as department,
                  u.position as position, COUNT(l.id) as cnt, MAX(l.returned_at) as reached_at
           FROM loans l JOIN users u ON u.id = l.user_id
           WHERE ${where}
           GROUP BY u.id
           ORDER BY cnt DESC, reached_at ASC`
        )
        .all() as UserRankRow[]

      return rows.map((r) => ({
        key: String(r.id),
        label: r.label,
        sub: `${r.company} · ${r.department} · ${r.position}`,
        count: r.cnt,
        reachedAt: r.reached_at,
        userId: r.id,
      }))
    }

    const { groupBy, select } = GROUP_CONFIG[by]
    const rows = db
      .prepare(
        `SELECT ${select}, COUNT(l.id) as cnt, MAX(l.returned_at) as reached_at
         FROM loans l JOIN users u ON u.id = l.user_id
         WHERE ${where}
         GROUP BY ${groupBy}
         ORDER BY cnt DESC, reached_at ASC`
      )
      .all() as GroupRankRow[]

    return rows.map((r) => {
      if (by === 'team') {
        return {
          key: `${r.company}/${r.department}/${r.label}`,
          label: r.label,
          sub: `${r.company} · ${r.department}`,
          count: r.cnt,
          reachedAt: r.reached_at,
        }
      }
      if (by === 'department') {
        return {
          key: `${r.company}/${r.label}`,
          label: r.label,
          sub: r.company,
          count: r.cnt,
          reachedAt: r.reached_at,
        }
      }
      return { key: r.label, label: r.label, count: r.cnt, reachedAt: r.reached_at }
    })
  },
}
