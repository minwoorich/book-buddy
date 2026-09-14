import { getDb } from '../db/connection'
import type { QaCategory, QaFeedback, QaSeverity } from '../../shared/types'

interface QaFeedbackRow {
  id: number
  user_id: number
  path: string
  viewport: string | null
  content: string
  category: QaCategory
  severity: QaSeverity
  detail: string | null
  image_paths: string
  status: QaFeedback['status']
  created_at: string
}

/** image_paths는 JSON 배열 문자열 — 깨진 값이면 빈 배열로 가드한다. */
function parseImagePaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

function toQaFeedback(row: QaFeedbackRow): QaFeedback {
  return {
    id: row.id,
    userId: row.user_id,
    path: row.path,
    viewport: row.viewport,
    content: row.content,
    category: row.category,
    severity: row.severity,
    detail: row.detail,
    images: parseImagePaths(row.image_paths),
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

export interface QaFeedbackInput {
  path: string
  viewport: string | null
  content: string
  category: QaCategory
  severity: QaSeverity
  detail: string | null
  images: string[]
}

export const qaFeedbackRepo = {
  insert(userId: number, input: QaFeedbackInput): QaFeedback {
    const result = getDb()
      .prepare(
        `INSERT INTO qa_feedback (user_id, path, viewport, content, category, severity, detail, image_paths)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        input.path,
        input.viewport,
        input.content,
        input.category,
        input.severity,
        input.detail,
        JSON.stringify(input.images)
      )
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

  /** 해결 처리 시 스크린샷 파일을 지운 뒤 경로 목록도 비운다. */
  clearImages(id: number): void {
    getDb().prepare(`UPDATE qa_feedback SET image_paths = '[]' WHERE id = ?`).run(id)
  },
}
