import { getDb } from '../db/connection'
import type { Notice } from '../../shared/types'

interface NoticeRow {
  id: number
  author_id: number
  author_name: string
  title: string
  content: string
  pinned: number
  created_at: string
  updated_at: string
}

export interface NoticeInput {
  title: string
  content: string
  pinned: boolean
}

function toNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    title: row.title,
    content: row.content,
    pinned: Boolean(row.pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT = `SELECT n.*, u.name AS author_name FROM notices n JOIN users u ON u.id = n.author_id`

export const noticeRepo = {
  /** 고정 공지 먼저, 그 다음 최신순. */
  listAll(): Notice[] {
    const rows = getDb()
      .prepare(`${SELECT} ORDER BY n.pinned DESC, n.created_at DESC, n.id DESC`)
      .all() as NoticeRow[]
    return rows.map(toNotice)
  },

  findById(id: number): Notice | undefined {
    const row = getDb().prepare(`${SELECT} WHERE n.id = ?`).get(id) as NoticeRow | undefined
    return row ? toNotice(row) : undefined
  },

  insert(authorId: number, input: NoticeInput): Notice {
    const result = getDb()
      .prepare('INSERT INTO notices (author_id, title, content, pinned) VALUES (?, ?, ?, ?)')
      .run(authorId, input.title, input.content, input.pinned ? 1 : 0)
    return this.findById(Number(result.lastInsertRowid)) as Notice
  },

  update(id: number, input: NoticeInput): Notice | undefined {
    getDb()
      .prepare(
        `UPDATE notices SET title = ?, content = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(input.title, input.content, input.pinned ? 1 : 0, id)
    return this.findById(id)
  },

  remove(id: number): void {
    getDb().prepare('DELETE FROM notices WHERE id = ?').run(id)
  },
}
