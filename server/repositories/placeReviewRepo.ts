import { getDb } from '../db/connection'
import type { PlaceReview, PlaceReviewSummary } from '../../shared/types'
import { isPlaceTagCode, type PlaceTagCode } from '../../shared/constants/placeTags'
import type { PlaceReviewInput } from '../utils/placeReview'

interface PlaceReviewRow {
  id: number
  kakao_place_id: string
  place_name: string
  user_id: number
  user_name: string
  department: string
  tags: string
  comment: string
  created_at: string
  updated_at: string
}

const SELECT = `SELECT r.*, u.name AS user_name, u.department AS department
                FROM place_reviews r JOIN users u ON u.id = r.user_id`

/** DB의 tags(JSON 문자열)를 코드 배열로. 깨진 값이나 모르는 코드는 조용히 버린다. */
function parseTags(raw: string): PlaceTagCode[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(isPlaceTagCode) : []
  } catch {
    return []
  }
}

function toPlaceReview(row: PlaceReviewRow): PlaceReview {
  return {
    id: row.id,
    kakaoPlaceId: row.kakao_place_id,
    placeName: row.place_name,
    userId: row.user_id,
    userName: row.user_name,
    department: row.department,
    tags: parseTags(row.tags),
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const RECENT_MAX = 2

export const placeReviewRepo = {
  /** 1인 1후기 — (kakao_place_id, user_id) 충돌 시 내용을 덮어쓴다. */
  upsert(kakaoPlaceId: string, userId: number, input: PlaceReviewInput): PlaceReview {
    getDb()
      .prepare(
        `INSERT INTO place_reviews (kakao_place_id, place_name, user_id, tags, comment)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kakao_place_id, user_id) DO UPDATE SET
           place_name = excluded.place_name, tags = excluded.tags, comment = excluded.comment,
           updated_at = datetime('now')`
      )
      .run(kakaoPlaceId, input.placeName, userId, JSON.stringify(input.tags), input.comment)
    return this.findMine(kakaoPlaceId, userId) as PlaceReview
  },

  findMine(kakaoPlaceId: string, userId: number): PlaceReview | undefined {
    const row = getDb()
      .prepare(`${SELECT} WHERE r.kakao_place_id = ? AND r.user_id = ?`)
      .get(kakaoPlaceId, userId) as PlaceReviewRow | undefined
    return row ? toPlaceReview(row) : undefined
  },

  /** 내 후기 삭제. 지운 행이 있으면 true. */
  remove(kakaoPlaceId: string, userId: number): boolean {
    const result = getDb()
      .prepare('DELETE FROM place_reviews WHERE kakao_place_id = ? AND user_id = ?')
      .run(kakaoPlaceId, userId)
    return result.changes > 0
  },

  /**
   * 장소 id 묶음의 후기 요약. 장소당 후기 수가 작아 SQL 집계 대신 전부 읽어 JS에서 센다.
   * 요청한 id 순서를 유지하고, 후기가 없는 id도 total 0으로 포함한다.
   */
  summaryByIds(ids: string[], meId: number): PlaceReviewSummary[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = getDb()
      .prepare(`${SELECT} WHERE r.kakao_place_id IN (${placeholders}) ORDER BY r.updated_at DESC, r.id DESC`)
      .all(...ids) as PlaceReviewRow[]

    const byPlace = new Map<string, PlaceReviewSummary>()
    for (const id of ids) {
      byPlace.set(id, { kakaoPlaceId: id, total: 0, tagCounts: {}, recent: [], mine: null })
    }
    for (const row of rows) {
      const summary = byPlace.get(row.kakao_place_id)
      if (!summary) continue
      const review = toPlaceReview(row)
      summary.total += 1
      for (const tag of review.tags) summary.tagCounts[tag] = (summary.tagCounts[tag] ?? 0) + 1
      if (review.comment && summary.recent.length < RECENT_MAX) {
        summary.recent.push({
          id: review.id,
          userName: review.userName,
          department: review.department,
          comment: review.comment,
          createdAt: review.createdAt,
        })
      }
      if (review.userId === meId) summary.mine = { tags: review.tags, comment: review.comment }
    }
    return ids.map((id) => byPlace.get(id) as PlaceReviewSummary)
  },
}
