import { getDb } from '../db/connection'
import { ApiError } from '../utils/errors'
import type { Book, Wishlist } from '../../shared/types'

interface WishlistRow {
  id: number
  user_id: number
  book_id: number
  created_at: string
}

interface WishlistWithBookRow extends WishlistRow {
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

function toWishlist(row: WishlistRow): Wishlist {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    createdAt: row.created_at,
  }
}

function toWishlistWithBook(row: WishlistWithBookRow): Wishlist & { book: Book } {
  return {
    ...toWishlist(row),
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

export const wishlistRepo = {
  /** book JOIN 포함 본인 찜 목록. 최신순. */
  listByUser(userId: number): (Wishlist & { book: Book })[] {
    const rows = getDb()
      .prepare(
        `SELECT w.*, ${BOOK_JOIN_COLUMNS} FROM wishlists w JOIN books b ON b.id = w.book_id
         WHERE w.user_id = ? ORDER BY w.created_at DESC`
      )
      .all(userId) as WishlistWithBookRow[]
    return rows.map(toWishlistWithBook)
  },

  /** 찜 추가. 같은 유저가 같은 책을 두 번 찜하면(UNIQUE 위반) 409. */
  insert(userId: number, bookId: number): Wishlist {
    try {
      const result = getDb()
        .prepare('INSERT INTO wishlists (user_id, book_id) VALUES (?, ?)')
        .run(userId, bookId)
      return toWishlist(
        getDb()
          .prepare('SELECT * FROM wishlists WHERE id = ?')
          .get(Number(result.lastInsertRowid)) as WishlistRow
      )
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) {
        throw new ApiError(409, '이미 찜한 책이에요')
      }
      throw err
    }
  },

  findById(id: number): Wishlist | undefined {
    const row = getDb().prepare('SELECT * FROM wishlists WHERE id = ?').get(id) as
      | WishlistRow
      | undefined
    return row ? toWishlist(row) : undefined
  },

  remove(id: number): void {
    getDb().prepare('DELETE FROM wishlists WHERE id = ?').run(id)
  },

  countByBook(bookId: number): number {
    const row = getDb()
      .prepare('SELECT COUNT(*) as cnt FROM wishlists WHERE book_id = ?')
      .get(bookId) as { cnt: number }
    return row.cnt
  },

  existsByUserAndBook(userId: number, bookId: number): boolean {
    const row = getDb()
      .prepare('SELECT 1 FROM wishlists WHERE user_id = ? AND book_id = ?')
      .get(userId, bookId) as unknown
    return row !== undefined
  },
}
