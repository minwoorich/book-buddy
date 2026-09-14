import { getDb } from '../db/connection'
import { bookRepo } from '../repositories/bookRepo'
import { homeSectionRepo } from '../repositories/homeSectionRepo'
import { reviewRepo } from '../repositories/reviewRepo'
import { loanService } from './loanService'
import type { Book, HomeSection } from '../../shared/types'

type BookWithMeta = Book & {
  status: 'available' | 'loaned'
  waitingCount: number
  avgRating: number | null
  reviewCount: number
}

const SECTION_BOOK_LIMIT = 6
const CATEGORY_PREFIX = 'cat-'

// GET /api/books와 동일한 부가필드 계산 로직 재사용(N+1 허용 — 데모 규모라 무방하다).
function withMeta(book: Book): BookWithMeta {
  const status = loanService.bookStatus(book.id)
  const { avg, count } = reviewRepo.avgForBook(book.id)
  return {
    ...book,
    status: status.status,
    waitingCount: status.waitingCount,
    avgRating: avg,
    reviewCount: count,
  }
}

/**
 * 섹션별 정렬/필터 기준에 맞는 책 id 목록을 구한다. 정렬 자체는 SQL로 하되, 실제
 * snake↔camel 매핑은 bookRepo.findById에 맡긴다(레포 밖에서 행을 직접 매핑하지 않는다).
 */
function idsForSection(section: HomeSection): number[] {
  const db = getDb()

  if (section.sectionKey === 'new') {
    return (db.prepare('SELECT id FROM books ORDER BY id DESC LIMIT ?').all(SECTION_BOOK_LIMIT) as { id: number }[]).map(
      (r) => r.id
    )
  }

  if (section.sectionKey === 'top-rated') {
    return (
      db
        .prepare(
          `SELECT b.id as id, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count
           FROM books b JOIN reviews r ON r.book_id = b.id
           GROUP BY b.id
           HAVING review_count >= 1
           ORDER BY avg_rating DESC
           LIMIT ?`
        )
        .all(SECTION_BOOK_LIMIT) as { id: number }[]
    ).map((r) => r.id)
  }

  if (section.sectionKey === 'popular') {
    return (
      db
        .prepare(
          `SELECT b.id as id, COUNT(l.id) as loan_count
           FROM books b JOIN loans l ON l.book_id = b.id
           GROUP BY b.id
           ORDER BY loan_count DESC
           LIMIT ?`
        )
        .all(SECTION_BOOK_LIMIT) as { id: number }[]
    ).map((r) => r.id)
  }

  if (section.sectionKey === 'available') {
    return (
      db
        .prepare(
          `SELECT b.id as id
           FROM books b
           WHERE NOT EXISTS (SELECT 1 FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL)
           ORDER BY b.id DESC
           LIMIT ?`
        )
        .all(SECTION_BOOK_LIMIT) as { id: number }[]
    ).map((r) => r.id)
  }

  if (section.sectionKey.startsWith(CATEGORY_PREFIX)) {
    const category = section.sectionKey.slice(CATEGORY_PREFIX.length)
    return (
      db
        .prepare('SELECT id FROM books WHERE category = ? ORDER BY id DESC LIMIT ?')
        .all(category, SECTION_BOOK_LIMIT) as { id: number }[]
    ).map((r) => r.id)
  }

  return []
}

export const homeService = {
  /** 노출 섹션을 sort_order순으로, 각각 책 최대 6권과 함께 반환한다(홈 화면 '전체' 카테고리용). */
  getHomeSections(): { key: string; title: string; books: BookWithMeta[] }[] {
    return homeSectionRepo.listEnabled().map((section) => {
      const books = idsForSection(section)
        .map((id) => bookRepo.findById(id))
        .filter((b): b is Book => Boolean(b))
        .map(withMeta)
      return { key: section.sectionKey, title: section.title, books }
    })
  },
}
