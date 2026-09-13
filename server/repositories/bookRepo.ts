import { getDb } from '../db/connection'
import type { Book, NewBook } from '../../shared/types'

interface BookRow {
  id: number
  isbn13: string | null
  title: string
  author: string
  publisher: string | null
  category: string
  description: string | null
  cover_url: string | null
  pub_date: string | null
  page_count: number | null
}

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    isbn13: row.isbn13,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    category: row.category,
    description: row.description,
    coverUrl: row.cover_url,
    pubDate: row.pub_date,
    pageCount: row.page_count,
  }
}

export const bookRepo = {
  findAll(q?: { query?: string; category?: string }): Book[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (q?.query) {
      clauses.push('(title LIKE ? OR author LIKE ?)')
      params.push(`%${q.query}%`, `%${q.query}%`)
    }
    if (q?.category) {
      clauses.push('category = ?')
      params.push(q.category)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = getDb().prepare(`SELECT * FROM books ${where}`).all(...params) as BookRow[]
    return rows.map(toBook)
  },

  findById(id: number): Book | undefined {
    const row = getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined
    return row ? toBook(row) : undefined
  },

  insert(b: NewBook): number {
    const result = getDb()
      .prepare(
        `INSERT INTO books (isbn13, title, author, publisher, category, description, cover_url, pub_date, page_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(b.isbn13, b.title, b.author, b.publisher, b.category, b.description, b.coverUrl, b.pubDate, b.pageCount)
    return Number(result.lastInsertRowid)
  },

  remove(id: number): void {
    getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
  },

  categories(): string[] {
    const rows = getDb().prepare('SELECT DISTINCT category FROM books').all() as { category: string }[]
    return rows.map((row) => row.category)
  },
}
