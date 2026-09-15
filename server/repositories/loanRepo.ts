import { getDb } from '../db/connection'
import type { Book, Loan } from '../../shared/types'

interface LoanRow {
  id: number
  book_id: number
  user_id: number
  loaned_at: string
  due_at: string
  returned_at: string | null
}

interface LoanWithBookRow extends LoanRow {
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
}

const BOOK_JOIN_COLUMNS = `
  b.id as bk_id, b.isbn13 as bk_isbn13, b.title as bk_title, b.author as bk_author,
  b.publisher as bk_publisher, b.category as bk_category, b.description as bk_description,
  b.cover_url as bk_cover_url, b.pub_date as bk_pub_date, b.page_count as bk_page_count
`

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

function toLoanWithBook(row: LoanWithBookRow): Loan & { book: Book } {
  return {
    ...toLoan(row),
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
  }
}

export const loanRepo = {
  /** 책별 누적 대출 횟수(반납 여부 무관) — 인기순 정렬용(QA #15). */
  countsByBook(): Map<number, number> {
    const rows = getDb()
      .prepare('SELECT book_id, COUNT(*) as cnt FROM loans GROUP BY book_id')
      .all() as { book_id: number; cnt: number }[]
    return new Map(rows.map((r) => [r.book_id, r.cnt]))
  },

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

  /** 대출 기록 삭제 — 잘못 누른 대출의 "취소"용(QA #28). 완독/랭킹 집계에 남지 않는다. */
  remove(id: number): void {
    getDb().prepare('DELETE FROM loans WHERE id = ?').run(id)
  },

  recent(limit: number): Loan[] {
    const rows = getDb()
      .prepare('SELECT * FROM loans ORDER BY loaned_at DESC LIMIT ?')
      .all(limit) as LoanRow[]
    return rows.map(toLoan)
  },

  /**
   * book JOIN 포함 대출 목록. userId 생략 시 전체(관리자 대시보드용).
   * active: returned_at IS NULL, returned: returned_at IS NOT NULL,
   * returnedFrom/returnedTo: returned_at 범위(ISO 문자열 프리픽스 비교),
   * limit: 최근 N건만(관리자 대시보드 "최근 대출·반납" 테이블용).
   */
  findWithBook(opts?: {
    userId?: number
    active?: boolean
    returned?: boolean
    returnedFrom?: string
    returnedTo?: string
    limit?: number
  }): (Loan & { book: Book })[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts?.userId !== undefined) {
      clauses.push('l.user_id = ?')
      params.push(opts.userId)
    }
    if (opts?.active) {
      clauses.push('l.returned_at IS NULL')
    }
    if (opts?.returned) {
      clauses.push('l.returned_at IS NOT NULL')
    }
    if (opts?.returnedFrom) {
      clauses.push('l.returned_at >= ?')
      params.push(opts.returnedFrom)
    }
    if (opts?.returnedTo) {
      clauses.push('l.returned_at <= ?')
      params.push(opts.returnedTo)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const limit = opts?.limit ? 'LIMIT ?' : ''
    if (opts?.limit) params.push(opts.limit)
    const rows = getDb()
      .prepare(
        `SELECT l.*, ${BOOK_JOIN_COLUMNS} FROM loans l JOIN books b ON b.id = l.book_id
         ${where} ORDER BY l.loaned_at DESC ${limit}`
      )
      .all(...params) as LoanWithBookRow[]
    return rows.map(toLoanWithBook)
  },
}
