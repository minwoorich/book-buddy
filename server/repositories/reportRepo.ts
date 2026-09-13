import { getDb } from '../db/connection'
import type { Report } from '../../shared/types'

interface ReportRow {
  id: number
  reporter_id: number
  target_type: Report['targetType']
  target_id: number
  reason: string
  status: Report['status']
  created_at: string
}

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }
}

interface ReportWithMetaRow extends ReportRow {
  reporter_name: string
  book_title: string | null
}

function toReportWithMeta(row: ReportWithMetaRow): Report & { reporterName: string; targetLabel: string } {
  return {
    ...toReport(row),
    reporterName: row.reporter_name,
    targetLabel: row.target_type === 'book' && row.book_title ? row.book_title : `#${row.target_id}`,
  }
}

export const reportRepo = {
  /** 본인이 접수한 신고 목록. 최신순. */
  listByUser(reporterId: number): Report[] {
    const rows = getDb()
      .prepare('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC')
      .all(reporterId) as ReportRow[]
    return rows.map(toReport)
  },

  /**
   * 전체 신고 목록(관리자용). status 생략 시 전체. 신고자 이름·대상 라벨(책이면 제목,
   * post/review면 '#id')을 함께 내려준다. 최신순.
   */
  listByStatus(status?: Report['status']): (Report & { reporterName: string; targetLabel: string })[] {
    const where = status ? 'WHERE r.status = ?' : ''
    const rows = getDb()
      .prepare(
        `SELECT r.*, u.name as reporter_name, b.title as book_title
         FROM reports r
         JOIN users u ON u.id = r.reporter_id
         LEFT JOIN books b ON r.target_type = 'book' AND r.target_id = b.id
         ${where} ORDER BY r.created_at DESC`
      )
      .all(...(status ? [status] : [])) as ReportWithMetaRow[]
    return rows.map(toReportWithMeta)
  },

  insert(reporterId: number, targetType: Report['targetType'], targetId: number, reason: string): Report {
    const result = getDb()
      .prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)')
      .run(reporterId, targetType, targetId, reason)
    return toReport(
      getDb().prepare('SELECT * FROM reports WHERE id = ?').get(Number(result.lastInsertRowid)) as ReportRow
    )
  },

  findById(id: number): Report | undefined {
    const row = getDb().prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | undefined
    return row ? toReport(row) : undefined
  },

  updateStatus(id: number, status: Report['status']): void {
    getDb().prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, id)
  },
}
