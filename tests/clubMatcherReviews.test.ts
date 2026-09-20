import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { runMatcher } from '../server/services/clubMatcher'

// vi.mock을 쓰지 않는다 — reviewsFor·bookTitleOf의 실제 SQL을 태워서 컬럼명이 바뀌면
// 이 테스트가 실패하게 한다(clubMatcher.test.ts는 generateAgenda를 모킹해 이 경로를 안 탄다).
const NOW = new Date('2026-09-20T00:00:00Z')

function insertBook(title: string): number {
  return Number(
    getDb().prepare(`INSERT INTO books (title, author, category) VALUES (?, '저자', '경제경영')`).run(title)
      .lastInsertRowid
  )
}

function insertUser(name: string, department = '개발본부'): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO users (name, company, department, team, position, gender, birth_year)
         VALUES (?, '바텍', ?, '1팀', '사원', 'F', 1995)`
      )
      .run(name, department).lastInsertRowid
  )
}

function insertReturnedLoan(bookId: number, userId: number, daysAgo: number): void {
  getDb()
    .prepare(
      `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at)
       VALUES (?, ?, datetime('now', ?), datetime('now'), datetime('now', ?))`
    )
    .run(bookId, userId, `-${daysAgo + 14} day`, `-${daysAgo} day`)
}

beforeEach(() => {
  initDb(':memory:')
})

describe('runMatcher (리뷰 SQL 실사용)', () => {
  it('리뷰가 하나 있어도 빈 API 키면 폴백 아젠다로 제안을 만든다', async () => {
    const bookId = insertBook('하드씽')
    const userIds = ['개발본부', '영업본부', '연구소'].map((dept, i) => {
      const userId = insertUser(`독자${i}`, dept)
      insertReturnedLoan(bookId, userId, 5 + i)
      return userId
    })
    getDb()
      .prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, ?, '좋았어요')`)
      .run(bookId, userIds[0], 5)

    const result = await runMatcher({ anthropicApiKey: '' }, NOW)

    expect(result.created).toBe(1)
    const club = clubRepo.findById(result.clubIds[0]!)!
    expect(club.agenda.length).toBeGreaterThanOrEqual(3)
    for (const item of club.agenda) {
      expect(item.evidence).toHaveLength(0)
    }
  })
})
