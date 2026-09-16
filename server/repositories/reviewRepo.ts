import { getDb } from '../db/connection'
import type { Review } from '../../shared/types'

interface ReviewRow {
  id: number
  book_id: number
  user_id: number
  rating: number
  content: string
  created_at: string
}

interface ReviewJoinRow extends ReviewRow {
  user_name: string
  department: string
  vote_count: number
  voted_by_me: number
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    rating: row.rating,
    content: row.content,
    createdAt: row.created_at,
  }
}

function toReviewWithMeta(
  row: ReviewJoinRow
): Review & { userName: string; department: string; voteCount: number; votedByMe: boolean } {
  return {
    ...toReview(row),
    userName: row.user_name,
    department: row.department,
    voteCount: row.vote_count,
    votedByMe: Boolean(row.voted_by_me),
  }
}

export const reviewRepo = {
  /** 책의 리뷰 목록. voteCount 내림차순, 동률이면 최신순. meId가 있으면 votedByMe도 채운다. */
  listByBook(
    bookId: number,
    meId?: number
  ): (Review & { userName: string; department: string; voteCount: number; votedByMe: boolean })[] {
    const rows = getDb()
      .prepare(
        `SELECT r.id, r.book_id, r.user_id, r.rating, r.content, r.created_at,
                u.name AS user_name, u.department AS department,
                (SELECT COUNT(*) FROM review_votes rv WHERE rv.review_id = r.id) AS vote_count,
                EXISTS(SELECT 1 FROM review_votes rv2 WHERE rv2.review_id = r.id AND rv2.user_id = ?) AS voted_by_me
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         WHERE r.book_id = ?
         ORDER BY vote_count DESC, r.created_at DESC`
      )
      .all(meId ?? 0, bookId) as ReviewJoinRow[]
    return rows.map(toReviewWithMeta)
  },

  insert(bookId: number, userId: number, rating: number, content: string): Review {
    const result = getDb()
      .prepare('INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, ?, ?)')
      .run(bookId, userId, rating, content)
    return toReview(
      getDb().prepare('SELECT * FROM reviews WHERE id = ?').get(Number(result.lastInsertRowid)) as ReviewRow
    )
  },

  findById(id: number): Review | undefined {
    const row = getDb().prepare('SELECT * FROM reviews WHERE id = ?').get(id) as ReviewRow | undefined
    return row ? toReview(row) : undefined
  },

  /** 내가 남긴 리뷰 전체(최신순) — 내 서재 "내가 남긴 리뷰" 섹션용(QA #25). 책 제목·표지 포함. */
  listByUser(userId: number): (Review & { bookTitle: string; bookCoverUrl: string | null })[] {
    const rows = getDb()
      .prepare(
        `SELECT r.id, r.book_id, r.user_id, r.rating, r.content, r.created_at,
                b.title AS book_title, b.cover_url AS book_cover_url
         FROM reviews r
         JOIN books b ON b.id = r.book_id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC, r.id DESC`
      )
      .all(userId) as (ReviewRow & { book_title: string; book_cover_url: string | null })[]
    return rows.map((row) => ({ ...toReview(row), bookTitle: row.book_title, bookCoverUrl: row.book_cover_url }))
  },

  /**
   * 전체 리뷰 모아보기(왓챠피디아식 코멘트 피드). 작성자·책·추천 수 포함.
   * sort: popular=추천순, latest=최신순, rating=별점 높은 순(동률은 최신순).
   *
   * 소속 필터(company/department/team)는 랭킹과 같은 규칙으로 상위 소속까지 AND로 묶는다 —
   * "바텍/연구소"와 "레이언스/연구소"는 이름이 같아도 다른 조직이기 때문(rankingService 참고).
   * topReaderIds가 주어지면 그 사용자들의 리뷰만 남긴다(다독왕 리뷰 보기). 빈 배열이면 결과도 비어 있다.
   */
  listAllWithMeta(
    meId: number,
    opts: {
      sort: 'popular' | 'latest' | 'rating'
      company?: string
      department?: string
      team?: string
      topReaderIds?: number[]
      limit?: number
    }
  ): (Review & {
    userName: string
    department: string
    voteCount: number
    votedByMe: boolean
    bookTitle: string
    bookAuthor: string
    bookCoverUrl: string | null
  })[] {
    const { sort, company, department, team, topReaderIds, limit = 60 } = opts
    if (topReaderIds && topReaderIds.length === 0) return []

    const orderBy =
      sort === 'popular'
        ? 'vote_count DESC, r.created_at DESC'
        : sort === 'rating'
          ? 'r.rating DESC, r.created_at DESC'
          : 'r.created_at DESC, r.id DESC'

    const conditions: string[] = []
    const filterParams: (string | number)[] = []
    if (company) {
      conditions.push('u.company = ?')
      filterParams.push(company)
    }
    if (department) {
      conditions.push('u.department = ?')
      filterParams.push(department)
    }
    if (team) {
      conditions.push('u.team = ?')
      filterParams.push(team)
    }
    if (topReaderIds) {
      conditions.push(`u.id IN (${topReaderIds.map(() => '?').join(', ')})`)
      filterParams.push(...topReaderIds)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = getDb()
      .prepare(
        `SELECT r.id, r.book_id, r.user_id, r.rating, r.content, r.created_at,
                u.name AS user_name, u.department AS department,
                b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url,
                (SELECT COUNT(*) FROM review_votes rv WHERE rv.review_id = r.id) AS vote_count,
                EXISTS(SELECT 1 FROM review_votes rv2 WHERE rv2.review_id = r.id AND rv2.user_id = ?) AS voted_by_me
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         JOIN books b ON b.id = r.book_id
         ${where}
         ORDER BY ${orderBy}
         LIMIT ?`
      )
      .all(meId, ...filterParams, limit) as (ReviewJoinRow & {
      book_title: string
      book_author: string
      book_cover_url: string | null
    })[]
    return rows.map((row) => ({
      ...toReviewWithMeta(row),
      bookTitle: row.book_title,
      bookAuthor: row.book_author,
      bookCoverUrl: row.book_cover_url,
    }))
  },

  /**
   * 리뷰를 실제로 남긴 사람들의 소속 목록(중복 제거). 모아보기 소속 드롭다운용 —
   * 고르면 반드시 결과가 있는 선택지만 내려간다.
   */
  orgOptions(): { company: string; department: string; team: string }[] {
    return getDb()
      .prepare(
        `SELECT DISTINCT u.company AS company, u.department AS department, u.team AS team
         FROM reviews r JOIN users u ON u.id = r.user_id
         ORDER BY u.company, u.department, u.team`
      )
      .all() as { company: string; department: string; team: string }[]
  },

  /** 전체 리뷰 수·평균 별점 — 모아보기 페이지 헤더 요약용. */
  globalStats(): { count: number; avg: number | null } {
    const row = getDb().prepare('SELECT COUNT(*) AS count, AVG(rating) AS avg FROM reviews').get() as {
      count: number
      avg: number | null
    }
    return row
  },

  /** 한 사용자가 이 책에 이미 남긴 리뷰(1인 1리뷰 규칙 검사용 — QA #18). */
  findByBookAndUser(bookId: number, userId: number): Review | undefined {
    const row = getDb()
      .prepare('SELECT * FROM reviews WHERE book_id = ? AND user_id = ?')
      .get(bookId, userId) as ReviewRow | undefined
    return row ? toReview(row) : undefined
  },

  update(id: number, rating: number, content: string): void {
    getDb().prepare('UPDATE reviews SET rating = ?, content = ? WHERE id = ?').run(rating, content, id)
  },

  /** 리뷰 삭제 — 추천(review_votes)부터 지워 FK 제약을 지킨다. */
  remove(id: number): void {
    const db = getDb()
    db.prepare('DELETE FROM review_votes WHERE review_id = ?').run(id)
    db.prepare('DELETE FROM reviews WHERE id = ?').run(id)
  },

  avgForBook(bookId: number): { avg: number | null; count: number } {
    const row = getDb()
      .prepare('SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE book_id = ?')
      .get(bookId) as { avg: number | null; count: number }
    return { avg: row.avg, count: row.count }
  },
}
