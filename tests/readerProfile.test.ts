import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { memberRepo } from '../server/repositories/memberRepo'

function insertUser(name: string, role: 'member' | 'admin' = 'member'): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES (?, '바텍', '개발본부', 'SW개발팀', '사원', 'M', 1996, ?)`
    )
    .run(name, role)
  return Number(result.lastInsertRowid)
}

function insertBook(title: string): number {
  const result = getDb().prepare(`INSERT INTO books (title, author, category) VALUES (?, '저자', '인문')`).run(title)
  return Number(result.lastInsertRowid)
}

function insertLoan(userId: number, bookId: number, loanedDaysAgo: number, returnedDaysAgo: number | null): void {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  const dbTime = (daysAgo: number) => iso(daysAgo).slice(0, 19).replace('T', ' ')
  getDb()
    .prepare(`INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?)`)
    .run(bookId, userId, dbTime(loanedDaysAgo), iso(loanedDaysAgo - 14), returnedDaysAgo === null ? null : dbTime(returnedDaysAgo))
}

function insertReview(bookId: number, userId: number, rating: number, content: string): void {
  getDb().prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, ?, ?)`).run(bookId, userId, rating, content)
}

beforeEach(() => {
  initDb(':memory:')
})

describe('memberRepo.readerProfileOf — 랭킹에서 여는 다른 사람의 독서 프로필', () => {
  it('완독한 책만 최근 반납순으로, 대출중인 책은 빼고 돌려준다', () => {
    const me = insertUser('민우')
    const first = insertBook('먼저 읽은 책')
    const latest = insertBook('최근 읽은 책')
    const reading = insertBook('지금 읽는 책')
    insertLoan(me, first, 60, 50)
    insertLoan(me, latest, 20, 10)
    insertLoan(me, reading, 3, null)

    const profile = memberRepo.readerProfileOf(me)
    expect(profile?.books.map((b) => b.title)).toEqual(['최근 읽은 책', '먼저 읽은 책'])
    expect(profile?.doneCount).toBe(2)
    expect(profile?.books[0].returnedAt).not.toBeNull()
  })

  it('남긴 리뷰를 책 제목과 함께 최근순으로 돌려준다', () => {
    const me = insertUser('민우')
    const book = insertBook('미움받을 용기')
    insertLoan(me, book, 30, 20)
    insertReview(book, me, 5, '관계에 대한 관점이 바뀌었어요')

    const profile = memberRepo.readerProfileOf(me)
    expect(profile?.reviewCount).toBe(1)
    expect(profile?.reviews[0]).toMatchObject({ bookTitle: '미움받을 용기', rating: 5, content: '관계에 대한 관점이 바뀌었어요' })
  })

  it('다른 사람의 완독·리뷰는 섞이지 않는다', () => {
    const me = insertUser('민우')
    const other = insertUser('동료')
    const mine = insertBook('내 책')
    const theirs = insertBook('동료 책')
    insertLoan(me, mine, 30, 20)
    insertLoan(other, theirs, 30, 20)
    insertReview(theirs, other, 3, '동료 리뷰')

    const profile = memberRepo.readerProfileOf(me)
    expect(profile?.books.map((b) => b.title)).toEqual(['내 책'])
    expect(profile?.reviews).toEqual([])
  })

  it('전 직원이 보는 화면이라 성별·출생연도·권한 같은 개인정보는 내려주지 않는다', () => {
    const admin = insertUser('관리자', 'admin')
    const profile = memberRepo.readerProfileOf(admin)
    expect(profile?.user).toEqual({
      id: admin,
      name: '관리자',
      company: '바텍',
      department: '개발본부',
      team: 'SW개발팀',
      position: '사원',
    })
  })

  it('없는 사람이면 null', () => {
    expect(memberRepo.readerProfileOf(9999)).toBeNull()
  })
})
