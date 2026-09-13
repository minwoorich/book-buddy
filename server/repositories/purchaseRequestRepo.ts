import { getDb } from '../db/connection'
import type { PurchaseRequest } from '../../shared/types'

interface PurchaseRequestRow {
  id: number
  user_id: number
  title: string
  author: string | null
  isbn13: string | null
  cover_url: string | null
  reason: string | null
  created_at: string
  status: PurchaseRequest['status']
}

function toPurchaseRequest(row: PurchaseRequestRow): PurchaseRequest {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    author: row.author,
    isbn13: row.isbn13,
    coverUrl: row.cover_url,
    reason: row.reason,
    createdAt: row.created_at,
    status: row.status,
  }
}

export const purchaseRequestRepo = {
  /** 본인 구매 신청 목록. 최신순. */
  listByUser(userId: number): PurchaseRequest[] {
    const rows = getDb()
      .prepare('SELECT * FROM purchase_requests WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as PurchaseRequestRow[]
    return rows.map(toPurchaseRequest)
  },

  insert(
    userId: number,
    input: { title: string; author?: string | null; isbn13?: string | null; coverUrl?: string | null; reason?: string | null }
  ): PurchaseRequest {
    const result = getDb()
      .prepare(
        `INSERT INTO purchase_requests (user_id, title, author, isbn13, cover_url, reason)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        input.title,
        input.author ?? null,
        input.isbn13 ?? null,
        input.coverUrl ?? null,
        input.reason ?? null
      )
    return toPurchaseRequest(
      getDb()
        .prepare('SELECT * FROM purchase_requests WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as PurchaseRequestRow
    )
  },

  findById(id: number): PurchaseRequest | undefined {
    const row = getDb().prepare('SELECT * FROM purchase_requests WHERE id = ?').get(id) as
      | PurchaseRequestRow
      | undefined
    return row ? toPurchaseRequest(row) : undefined
  },

  updateStatus(id: number, status: PurchaseRequest['status']): void {
    getDb().prepare('UPDATE purchase_requests SET status = ? WHERE id = ?').run(status, id)
  },
}
