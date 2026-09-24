import { getDb } from '../db/connection'
import type { ClubPost } from '../../shared/types'

interface PostRow {
  id: number
  club_id: number
  user_id: number
  user_name: string
  department: string
  parent_id: number | null
  body: string
  created_at: string
}

const SELECT_POST = `SELECT p.*, u.name AS user_name, u.department AS department
                     FROM club_posts p JOIN users u ON u.id = p.user_id`

function toPost(row: PostRow): ClubPost {
  return {
    id: row.id,
    clubId: row.club_id,
    userId: row.user_id,
    userName: row.user_name,
    department: row.department,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
    replies: [],
  }
}

export const clubPostRepo = {
  /** 글은 최신순, 댓글은 시간순으로 글 아래에. 한 번 읽어 메모리에서 조립한다. */
  listByClub(clubId: number): ClubPost[] {
    const rows = getDb().prepare(`${SELECT_POST} WHERE p.club_id = ? ORDER BY p.id ASC`).all(clubId) as PostRow[]
    const tops: ClubPost[] = []
    const byId = new Map<number, ClubPost>()
    for (const row of rows) {
      const post = toPost(row)
      byId.set(post.id, post)
      if (post.parentId === null) tops.push(post)
      else byId.get(post.parentId)?.replies.push(post)
    }
    return tops.reverse()
  },

  insert(clubId: number, userId: number, parentId: number | null, body: string): ClubPost {
    const id = Number(
      getDb().prepare(`INSERT INTO club_posts (club_id, user_id, parent_id, body) VALUES (?, ?, ?, ?)`).run(clubId, userId, parentId, body).lastInsertRowid
    )
    return this.findById(id)!
  },

  findById(id: number): ClubPost | undefined {
    const row = getDb().prepare(`${SELECT_POST} WHERE p.id = ?`).get(id) as PostRow | undefined
    return row ? toPost(row) : undefined
  },

  /** 댓글을 먼저 지우고 글을 지운다(FK). */
  remove(id: number): void {
    const db = getDb()
    const run = db.transaction(() => {
      db.prepare(`DELETE FROM club_posts WHERE parent_id = ?`).run(id)
      db.prepare(`DELETE FROM club_posts WHERE id = ?`).run(id)
    })
    run()
  },
}
