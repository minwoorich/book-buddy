import { getDb } from '../db/connection'
import type { Book, Reservation } from '../../shared/types'

interface ReservationRow {
  id: number
  book_id: number
  user_id: number
  created_at: string
  status: 'waiting' | 'canceled' | 'fulfilled'
}

interface ReservationWithBookRow extends ReservationRow {
  bk_id: number
  bk_isbn13: string | null
  bk_title: string
  bk_author: string
  bk_publisher: string | null
  bk_category: string
  bk_description: string | null
  bk_cover_url: string | null
  bk_pub_date: string | null
  bk_page_count: number | null
  queue_rank: number
}

const BOOK_JOIN_COLUMNS = `
  b.id as bk_id, b.isbn13 as bk_isbn13, b.title as bk_title, b.author as bk_author,
  b.publisher as bk_publisher, b.category as bk_category, b.description as bk_description,
  b.cover_url as bk_cover_url, b.pub_date as bk_pub_date, b.page_count as bk_page_count
`

function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    createdAt: row.created_at,
    status: row.status,
  }
}

function toReservationWithBook(row: ReservationWithBookRow): Reservation & { book: Book; queueRank: number } {
  return {
    ...toReservation(row),
    book: {
      id: row.bk_id,
      isbn13: row.bk_isbn13,
      title: row.bk_title,
      author: row.bk_author,
      publisher: row.bk_publisher,
      category: row.bk_category,
      description: row.bk_description,
      coverUrl: row.bk_cover_url,
      pubDate: row.bk_pub_date,
      pageCount: row.bk_page_count,
    },
    queueRank: row.queue_rank,
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

  /**
   * book JOIN 포함 본인 waiting 예약 목록. queueRank는 같은 책에 대한 실제 대기열
   * 순번(1부터) — created_at이 더 이르거나(같으면 id가 더 작은) waiting 예약 수 + 1.
   */
  waitingByUserWithBook(userId: number): (Reservation & { book: Book; queueRank: number })[] {
    const rows = getDb()
      .prepare(
        `SELECT r.*, ${BOOK_JOIN_COLUMNS},
                (SELECT COUNT(*) FROM reservations r2
                 WHERE r2.book_id = r.book_id AND r2.status = 'waiting'
                   AND (r2.created_at < r.created_at OR (r2.created_at = r.created_at AND r2.id <= r.id))
                ) AS queue_rank
         FROM reservations r JOIN books b ON b.id = r.book_id
         WHERE r.user_id = ? AND r.status = 'waiting' ORDER BY r.created_at ASC`
      )
      .all(userId) as ReservationWithBookRow[]
    return rows.map(toReservationWithBook)
  },
}
