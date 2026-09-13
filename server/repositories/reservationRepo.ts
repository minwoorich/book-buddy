import { getDb } from '../db/connection'
import type { Reservation } from '../../shared/types'

interface ReservationRow {
  id: number
  book_id: number
  user_id: number
  created_at: string
  status: 'waiting' | 'canceled' | 'fulfilled'
}

function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    createdAt: row.created_at,
    status: row.status,
  }
}

export const reservationRepo = {
  firstWaiting(bookId: number): Reservation | undefined {
    const row = getDb()
      .prepare(
        "SELECT * FROM reservations WHERE book_id = ? AND status = 'waiting' ORDER BY created_at ASC, id ASC LIMIT 1"
      )
      .get(bookId) as ReservationRow | undefined
    return row ? toReservation(row) : undefined
  },

  waitingByUser(userId: number): Reservation[] {
    const rows = getDb()
      .prepare("SELECT * FROM reservations WHERE user_id = ? AND status = 'waiting'")
      .all(userId) as ReservationRow[]
    return rows.map(toReservation)
  },

  insert(bookId: number, userId: number): number {
    const result = getDb()
      .prepare('INSERT INTO reservations (book_id, user_id) VALUES (?, ?)')
      .run(bookId, userId)
    return Number(result.lastInsertRowid)
  },

  updateStatus(id: number, status: Reservation['status']): void {
    getDb().prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, id)
  },

  findById(id: number): Reservation | undefined {
    const row = getDb()
      .prepare('SELECT * FROM reservations WHERE id = ?')
      .get(id) as ReservationRow | undefined
    return row ? toReservation(row) : undefined
  },

  countWaiting(bookId: number): number {
    const row = getDb()
      .prepare("SELECT COUNT(*) as cnt FROM reservations WHERE book_id = ? AND status = 'waiting'")
      .get(bookId) as { cnt: number }
    return row.cnt
  },
}
