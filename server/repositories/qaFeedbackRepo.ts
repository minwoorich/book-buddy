import { getDb } from '../db/connection'
import type { QaFeedback } from '../../shared/types'

interface QaFeedbackRow {
  id: number
  user_id: number
  path: string
  viewport: string | null
  content: string
  status: QaFeedback['status']
  created_at: string
}

function toQaFeedback(row: QaFeedbackRow): QaFeedback {
  return {
    id: row.id,
    userId: row.user_id,
    path: row.path,
    viewport: row.viewport,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
  }
}

interface QaFeedbackWithUserRow extends QaFeedbackRow {
  user_name: string
  department: string
}

function toQaFeedbackWithUser(row: QaFeedbackWithUserRow): QaFeedback & { userName: string; department: string } {
  return { ...toQaFeedback(row), userName: row.user_name, department: row.department }
}

export const qaFeedbackRepo = {
  insert(userId: number, path: string, viewport: string | null, content: string): QaFeedback {
    const result = getDb()
      .prepare('INSERT INTO qa_feedback (user_id, path, viewport, content) VALUES (?, ?, ?, ?)')
      .run(userId, path, viewport, content)
    return toQaFeedback(
      getDb().prepare('SELECT * FROM qa_feedback WHERE id = ?').get(Number(result.lastInsertRowid)) as QaFeedbackRow
    )
  },

  /** 전체 목록(관리자용). status 생략 시 전체. 작성자 이름·부서 포함, 최신순. */
  listByStatus(status?: QaFeedback['status']): (QaFeedback & { userName: string; department: string })[] {
    const where = status ? 'WHERE q.status = ?' : ''
    const rows = getDb()
      .prepare(
        `SELECT q.*, u.name as user_name, u.department
         FROM qa_feedback q
         JOIN users u ON u.id = q.user_id
         ${where} ORDER BY q.created_at DESC, q.id DESC`
      )
      .all(...(status ? [status] : [])) as QaFeedbackWithUserRow[]
    return rows.map(toQaFeedbackWithUser)
  },

  findById(id: number): QaFeedback | undefined {
    const row = getDb().prepare('SELECT * FROM qa_feedback WHERE id = ?').get(id) as QaFeedbackRow | undefined
    return row ? toQaFeedback(row) : undefined
  },

  updateStatus(id: number, status: QaFeedback['status']): void {
    getDb().prepare('UPDATE qa_feedback SET status = ? WHERE id = ?').run(status, id)
  },
}
