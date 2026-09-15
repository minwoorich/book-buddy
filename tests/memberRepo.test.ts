import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { memberRepo } from '../server/repositories/memberRepo'

function insertUser(name: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES (?, '바텍', '개발본부', 'SW개발팀', '사원', 'M', 1996, 'member')`
    )
    .run(name)
  return Number(result.lastInsertRowid)
}

function insertBook(title: string): number {
  const result = getDb().prepare(`INSERT INTO books (title, author, category) VALUES (?, '저자', '인문')`).run(title)
  return Number(result.lastInsertRowid)
}

/** loaned/due/returned를 "며칠 전" 기준으로 넣는다. returnedDaysAgo=null이면 대출중. */
function insertLoan(userId: number, bookId: number, loanedDaysAgo: number, returnedDaysAgo: number | null): void {
  const dueDaysAgo = loanedDaysAgo - 14 // 마감 = 대출 + 14일 (음수면 아직 미래)
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  const db = (daysAgo: number) => iso(daysAgo).slice(0, 19).replace('T', ' ')
  getDb()
    .prepare(`INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?)`)
    .run(bookId, userId, db(loanedDaysAgo), iso(dueDaysAgo), returnedDaysAgo === null ? null : db(returnedDaysAgo))
}

beforeEach(() => {
  initDb(':memory:')
})

describe('memberRepo.summaries — 사람별 대출·반납·리뷰 집계', () => {
  it('대출중·연체·완독·리뷰 수와 마지막 활동을 사람별로 센다', () => {
    const minwoo = insertUser('민우')
    const other = insertUser('동료')
    const b1 = insertBook('책1')
    const b2 = insertBook('책2')
    const b3 = insertBook('책3')

    insertLoan(minwoo, b1, 40, 30) // 완독(반납)
    insertLoan(minwoo, b2, 20, null) // 대출중이지만 마감(6일 전) 지남 → 연체
    insertLoan(minwoo, b3, 3, null) // 대출중, 마감 전
    getDb().prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, 5, '좋아요')`).run(b1, minwoo)

    const byName = new Map(memberRepo.summaries().map((m) => [m.name, m]))
    expect(byName.get('민우')).toMatchObject({ activeLoans: 2, overdueLoans: 1, completedLoans: 1, reviewCount: 1 })
    expect(byName.get('민우')?.lastActivityAt).not.toBeNull()
    expect(byName.get('동료')).toMatchObject({ activeLoans: 0, overdueLoans: 0, completedLoans: 0, reviewCount: 0, lastActivityAt: null })
    expect(other).toBeGreaterThan(0)
  })

  it('활동이 있는 사람이 먼저(마지막 활동 최신순), 활동 없는 사람은 뒤에 온다', () => {
    insertUser('조용한')
    const busy = insertUser('바쁜')
    const book = insertBook('책')
    insertLoan(busy, book, 2, null)
    expect(memberRepo.summaries().map((m) => m.name)).toEqual(['바쁜', '조용한'])
  })
})

describe('memberRepo.loansOf / reviewsOf', () => {
  it('한 사람의 대출 이력을 책과 함께 최근 대출순으로, 리뷰를 책 제목과 함께 돌려준다', () => {
    const me = insertUser('나')
    const old = insertBook('옛날 책')
    const recent = insertBook('최근 책')
    insertLoan(me, old, 100, 90)
    insertLoan(me, recent, 5, null)
    getDb().prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, 4, '괜찮아요')`).run(old, me)

    const loans = memberRepo.loansOf(me)
    expect(loans.map((l) => l.book.title)).toEqual(['최근 책', '옛날 책'])
    expect(loans[1].returnedAt).not.toBeNull()

    const reviews = memberRepo.reviewsOf(me)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ bookTitle: '옛날 책', rating: 4 })
  })
})
