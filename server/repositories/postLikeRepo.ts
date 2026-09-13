import { getDb } from '../db/connection'
import { ApiError } from '../utils/errors'

export const postLikeRepo = {
  /** 게시물 좋아요. 같은 유저가 같은 게시물을 두 번 좋아요하면(UNIQUE 위반) 409. */
  insert(postId: number, userId: number): void {
    try {
      getDb().prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, userId)
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) {
        throw new ApiError(409, '이미 좋아요했어요')
      }
      throw err
    }
  },

  remove(postId: number, userId: number): void {
    getDb().prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(postId, userId)
  },
}
