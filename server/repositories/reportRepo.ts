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

export const reportRepo = {
  /** 본인이 접수한 신고 목록. 최신순. */
  listByUser(reporterId: number): Report[] {
    const rows = getDb()
      .prepare('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC')
      .all(reporterId) as ReportRow[]
    return rows.map(toReport)
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
