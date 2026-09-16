import { getDb } from '../db/connection'
import { ApiError } from '../utils/errors'
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

/** 검색어를 공백으로 쪼갠 키워드들. 빈 토큰은 버리고(전체 매칭 방지) 최대 10개까지. */
const MAX_KEYWORDS = 10
function keywords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, MAX_KEYWORDS)
}

/** 제목+저자에 걸린 키워드 개수 — 많이 걸린 책을 위로 올리는 데 쓴다. */
function matchScore(book: Book, words: string[]): number {
  const haystack = `${book.title} ${book.author}`.toLowerCase()
  return words.filter((w) => haystack.includes(w.toLowerCase())).length
}

export const bookRepo = {
  findAll(q?: { query?: string; category?: string }): Book[] {
    const clauses: string[] = []
    const params: unknown[] = []
    // 검색어는 공백 단위로 쪼개 단어마다 제목/저자를 훑는다. 단어끼리는 OR라
    // 한 단어만 걸려도 결과에 나오고, 많이 걸린 책일수록 위로 정렬된다.
    const words = q?.query ? keywords(q.query) : []
    if (words.length) {
      clauses.push(`(${words.map(() => '(title LIKE ? OR author LIKE ?)').join(' OR ')})`)
      for (const word of words) params.push(`%${word}%`, `%${word}%`)
    }
    if (q?.category) {
      clauses.push('category = ?')
      params.push(q.category)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = getDb().prepare(`SELECT * FROM books ${where}`).all(...params) as BookRow[]
    const books = rows.map(toBook)
    if (words.length < 2) return books
    return books
      .map((book, index) => ({ book, index, score: matchScore(book, words) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.book)
  },

  findById(id: number): Book | undefined {
    const row = getDb().prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined
    return row ? toBook(row) : undefined
  },

  /** 도서 메타데이터 부분 수정(외부 API 데이터 오류 교정용). 넘긴 필드만 갱신한다. */
  update(
    id: number,
    fields: Partial<Pick<Book, 'title' | 'author' | 'publisher' | 'category' | 'description' | 'coverUrl'>>
  ): void {
    const sets: string[] = []
    const params: unknown[] = []
    const columnByField: Record<string, string> = {
      title: 'title',
      author: 'author',
      publisher: 'publisher',
      category: 'category',
      description: 'description',
      coverUrl: 'cover_url',
    }
    for (const [field, column] of Object.entries(columnByField)) {
      const value = (fields as Record<string, unknown>)[field]
      if (value !== undefined) {
        sets.push(`${column} = ?`)
        params.push(value)
      }
    }
    if (sets.length === 0) return
    getDb().prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...params, id)
  },

  findByIsbn13(isbn13: string): Book | undefined {
    const row = getDb().prepare('SELECT * FROM books WHERE isbn13 = ?').get(isbn13) as BookRow | undefined
    return row ? toBook(row) : undefined
  },

  /** 책 등록. isbn13이 이미 등록돼 있으면(UNIQUE 위반) 409. */
  insert(b: NewBook): number {
    try {
      const result = getDb()
        .prepare(
          `INSERT INTO books (isbn13, title, author, publisher, category, description, cover_url, pub_date, page_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(b.isbn13, b.title, b.author, b.publisher, b.category, b.description, b.coverUrl, b.pubDate, b.pageCount)
      return Number(result.lastInsertRowid)
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) {
        throw new ApiError(409, '이미 등록된 책이에요')
      }
      throw err
    }
  },

  /** 책 삭제. 대출/찜/리뷰 등 이력이 남아있어 FK 제약에 걸리면 409. */
  remove(id: number): void {
    try {
      getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
    } catch (err) {
      if (err instanceof Error && /FOREIGN KEY constraint failed/.test(err.message)) {
        throw new ApiError(409, '대출 이력이 있는 책은 삭제할 수 없어요')
      }
      throw err
    }
  },

  categories(): string[] {
    const rows = getDb().prepare('SELECT DISTINCT category FROM books').all() as { category: string }[]
    return rows.map((row) => row.category)
  },
}
