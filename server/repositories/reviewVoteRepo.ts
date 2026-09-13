import { getDb } from '../db/connection'
import { ApiError } from '../utils/errors'

export const reviewVoteRepo = {
  /** 리뷰 추천. 같은 유저가 같은 리뷰를 두 번 추천하면(UNIQUE 위반) 409. */
  insert(reviewId: number, userId: number): void {
    try {
      getDb()
        .prepare('INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)')
        .run(reviewId, userId)
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) {
        throw new ApiError(409, '이미 추천한 리뷰예요')
      }
      throw err
    }
  },

  remove(reviewId: number, userId: number): void {
    getDb().prepare('DELETE FROM review_votes WHERE review_id = ? AND user_id = ?').run(reviewId, userId)
  },
}
