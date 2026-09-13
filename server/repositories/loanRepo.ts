import { getDb } from '../db/connection'
import type { Loan } from '../../shared/types'

interface LoanRow {
  id: number
  book_id: number
  user_id: number
  loaned_at: string
  due_at: string
  returned_at: string | null
}

function toLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    loanedAt: row.loaned_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
  }
}

export const loanRepo = {
  activeByBook(bookId: number): Loan | undefined {
    const row = getDb()
      .prepare('SELECT * FROM loans WHERE book_id = ? AND returned_at IS NULL')
      .get(bookId) as LoanRow | undefined
    return row ? toLoan(row) : undefined
  },

  findByUser(
    userId: number,
    opts?: { active?: boolean; returnedFrom?: string; returnedTo?: string }
  ): Loan[] {
    const clauses = ['user_id = ?']
    const params: unknown[] = [userId]
    if (opts?.active) {
      clauses.push('returned_at IS NULL')
    }
    if (opts?.returnedFrom) {
      clauses.push('returned_at >= ?')
      params.push(opts.returnedFrom)
    }
    if (opts?.returnedTo) {
      clauses.push('returned_at <= ?')
      params.push(opts.returnedTo)
    }
    const rows = getDb()
      .prepare(`SELECT * FROM loans WHERE ${clauses.join(' AND ')}`)
      .all(...params) as LoanRow[]
    return rows.map(toLoan)
  },

  insert(bookId: number, userId: number, dueAt: string): number {
    const result = getDb()
      .prepare('INSERT INTO loans (book_id, user_id, due_at) VALUES (?, ?, ?)')
      .run(bookId, userId, dueAt)
    return Number(result.lastInsertRowid)
  },

  findById(id: number): Loan | undefined {
    const row = getDb().prepare('SELECT * FROM loans WHERE id = ?').get(id) as LoanRow | undefined
    return row ? toLoan(row) : undefined
  },

  markReturned(id: number): void {
    getDb().prepare("UPDATE loans SET returned_at = datetime('now') WHERE id = ?").run(id)
  },

  recent(limit: number): Loan[] {
    const rows = getDb()
      .prepare('SELECT * FROM loans ORDER BY loaned_at DESC LIMIT ?')
      .all(limit) as LoanRow[]
    return rows.map(toLoan)
  },
}
