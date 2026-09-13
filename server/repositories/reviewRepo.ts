import { getDb } from '../db/connection'
import type { Review } from '../../shared/types'

interface ReviewRow {
  id: number
  book_id: number
  user_id: number
  rating: number
  content: string
  created_at: string
}

interface ReviewJoinRow extends ReviewRow {
  user_name: string
  department: string
  vote_count: number
  voted_by_me: number
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    rating: row.rating,
    content: row.content,
    createdAt: row.created_at,
  }
}

function toReviewWithMeta(
  row: ReviewJoinRow
): Review & { userName: string; department: string; voteCount: number; votedByMe: boolean } {
  return {
    ...toReview(row),
    userName: row.user_name,
    department: row.department,
    voteCount: row.vote_count,
    votedByMe: Boolean(row.voted_by_me),
  }
}

export const reviewRepo = {
  /** 책의 리뷰 목록. voteCount 내림차순, 동률이면 최신순. meId가 있으면 votedByMe도 채운다. */
  listByBook(
    bookId: number,
    meId?: number
  ): (Review & { userName: string; department: string; voteCount: number; votedByMe: boolean })[] {
    const rows = getDb()
      .prepare(
        `SELECT r.id, r.book_id, r.user_id, r.rating, r.content, r.created_at,
                u.name AS user_name, u.department AS department,
                (SELECT COUNT(*) FROM review_votes rv WHERE rv.review_id = r.id) AS vote_count,
                EXISTS(SELECT 1 FROM review_votes rv2 WHERE rv2.review_id = r.id AND rv2.user_id = ?) AS voted_by_me
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.book_id = ?
         ORDER BY vote_count DESC, r.created_at DESC`
      )
      .all(meId ?? 0, bookId) as ReviewJoinRow[]
    return rows.map(toReviewWithMeta)
  },

  insert(bookId: number, userId: number, rating: number, content: string): Review {
    const result = getDb()
      .prepare('INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, ?, ?)')
      .run(bookId, userId, rating, content)
    return toReview(
      getDb().prepare('SELECT * FROM reviews WHERE id = ?').get(Number(result.lastInsertRowid)) as ReviewRow
    )
  },

  findById(id: number): Review | undefined {
    const row = getDb().prepare('SELECT * FROM reviews WHERE id = ?').get(id) as ReviewRow | undefined
    return row ? toReview(row) : undefined
  },

  avgForBook(bookId: number): { avg: number | null; count: number } {
    const row = getDb()
      .prepare('SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE book_id = ?')
      .get(bookId) as { avg: number | null; count: number }
    return { avg: row.avg, count: row.count }
  },
}
