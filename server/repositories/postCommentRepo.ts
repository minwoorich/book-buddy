import { getDb } from '../db/connection'
import type { PostComment } from '../../shared/types'

interface PostCommentRow {
  id: number
  post_id: number
  user_id: number
  content: string
  created_at: string
}

interface PostCommentJoinRow extends PostCommentRow {
  user_name: string
}

function toPostComment(row: PostCommentRow): PostComment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
  }
}

export const postCommentRepo = {
  /** 게시물 댓글, 오래된순. */
  listByPost(postId: number): (PostComment & { userName: string })[] {
    const rows = getDb()
      .prepare(
        `SELECT pc.*, u.name AS user_name FROM post_comments pc
         JOIN users u ON u.id = pc.user_id
         WHERE pc.post_id = ? ORDER BY pc.created_at ASC`
      )
      .all(postId) as PostCommentJoinRow[]
    return rows.map((row) => ({ ...toPostComment(row), userName: row.user_name }))
  },

  insert(postId: number, userId: number, content: string): PostComment {
    const result = getDb()
      .prepare('INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)')
      .run(postId, userId, content)
    return toPostComment(
      getDb()
        .prepare('SELECT * FROM post_comments WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as PostCommentRow
    )
  },
}
