import { getDb } from '../db/connection'
import type { Book, Loan, PublicReader, ReaderProfile, Review, User } from '../../shared/types'
import { loanRepo } from './loanRepo'

/** 관리자 회원 목록 한 줄 — 사람별 대출·반납·리뷰 집계. */
export interface MemberSummary extends User {
  activeLoans: number
  overdueLoans: number
  completedLoans: number
  reviewCount: number
  /** 마지막 활동(대출·반납·리뷰 중 가장 최근, DB 타임스탬프). 활동이 없으면 null. */
  lastActivityAt: string | null
}

interface SummaryRow {
  id: number
  name: string
  company: string
  department: string
  team: string
  position: string
  gender: 'M' | 'F'
  birth_year: number
  role: 'member' | 'admin'
  is_guest: number
  active_loans: number
  overdue_loans: number
  completed_loans: number
  review_count: number
  last_activity_at: string | null
}

function toSummary(row: SummaryRow): MemberSummary {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    department: row.department,
    team: row.team,
    position: row.position,
    gender: row.gender,
    birthYear: row.birth_year,
    role: row.role,
    isGuest: row.is_guest === 1,
    activeLoans: row.active_loans,
    overdueLoans: row.overdue_loans,
    completedLoans: row.completed_loans,
    reviewCount: row.review_count,
    lastActivityAt: row.last_activity_at,
  }
}

/** 회원 상세의 리뷰 한 줄 — 책 제목·표지를 함께 준다. */
export type MemberReview = Review & { bookTitle: string; bookCoverUrl: string | null }

interface MemberReviewRow {
  id: number
  book_id: number
  user_id: number
  rating: number
  content: string
  created_at: string
  book_title: string
  book_cover_url: string | null
}

export const memberRepo = {
  /**
   * 전원 목록 + 집계. 연체는 "반납 안 됐고 due_at이 지금보다 과거". due_at은 ISO('...Z')이고
   * datetime('now')는 'YYYY-MM-DD HH:MM:SS'라 형식이 다르지만, 둘 다 UTC 기준 사전순 비교가
   * 시각순과 같아서(앞 19자가 같은 자리) 프리픽스 비교로 안전하다.
   */
  summaries(): MemberSummary[] {
    const rows = getDb()
      .prepare(
        `SELECT u.*,
           (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.returned_at IS NULL) AS active_loans,
           (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.returned_at IS NULL
              AND substr(replace(l.due_at, 'T', ' '), 1, 19) < datetime('now')) AS overdue_loans,
           (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.returned_at IS NOT NULL) AS completed_loans,
           (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS review_count,
           (SELECT MAX(t) FROM (
              SELECT MAX(l.loaned_at) AS t FROM loans l WHERE l.user_id = u.id
              UNION ALL SELECT MAX(l.returned_at) FROM loans l WHERE l.user_id = u.id
              UNION ALL SELECT MAX(r.created_at) FROM reviews r WHERE r.user_id = u.id
           )) AS last_activity_at
         FROM users u
         ORDER BY last_activity_at DESC NULLS LAST, u.name ASC`
      )
      .all() as SummaryRow[]
    return rows.map(toSummary)
  },

  /** 한 사람의 대출 이력 전체(책 포함, 최근 대출순). */
  loansOf(userId: number): (Loan & { book: Book })[] {
    return loanRepo.findWithBook({ userId })
  },

  /**
   * 랭킹에서 여는 다른 사람의 독서 프로필 — 완독한 책과 남긴 리뷰.
   * 전 직원이 보는 화면이라 신원은 이름·소속까지만 내려준다(성별·출생연도·권한·게스트 여부 제외).
   * 읽는 중인 책은 아직 "읽은 책"이 아니라서 제외한다.
   */
  readerProfileOf(userId: number): ReaderProfile | null {
    const row = getDb()
      .prepare(`SELECT id, name, company, department, team, position FROM users WHERE id = ?`)
      .get(userId) as PublicReader | undefined
    if (!row) return null

    // findWithBook은 대출 시각순이라, 완독 목록은 "최근에 다 읽은 순"으로 다시 세운다.
    const books = loanRepo
      .findWithBook({ userId, returned: true })
      .map((loan) => ({ ...loan.book, returnedAt: loan.returnedAt as string }))
      .sort((a, b) => b.returnedAt.localeCompare(a.returnedAt))
    const reviews = memberRepo.reviewsOf(userId)

    return {
      user: row,
      doneCount: books.length,
      reviewCount: reviews.length,
      books,
      reviews,
    }
  },

  /** 한 사람이 남긴 리뷰(최근순). */
  reviewsOf(userId: number): MemberReview[] {
    const rows = getDb()
      .prepare(
        `SELECT r.*, b.title AS book_title, b.cover_url AS book_cover_url
         FROM reviews r JOIN books b ON b.id = r.book_id
         WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC`
      )
      .all(userId) as MemberReviewRow[]
    return rows.map((row) => ({
      id: row.id,
      bookId: row.book_id,
      userId: row.user_id,
      rating: row.rating,
      content: row.content,
      createdAt: row.created_at,
      bookTitle: row.book_title,
      bookCoverUrl: row.book_cover_url,
    }))
  },
}
