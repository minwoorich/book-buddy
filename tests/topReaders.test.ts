import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { rankingService } from '../server/services/rankingService'

function insertUser(name: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year)
       VALUES (?, '바텍', '연구소', '플랫폼팀', '사원', 'M', 1996)`
    )
    .run(name)
  return Number(result.lastInsertRowid)
}

function insertBook(title: string): number {
  return Number(
    getDb().prepare(`INSERT INTO books (title, author, category) VALUES (?, '저자', '인문')`).run(title)
      .lastInsertRowid
  )
}

/** 이번 달에 반납 완료한 대출 n건. returnedAt은 'YYYY-MM-DD HH:MM:SS'(UTC). */
function returnLoans(userId: number, returnedAts: string[]): void {
  for (const returnedAt of returnedAts) {
    const book = insertBook(`책-${userId}-${returnedAt}`)
    getDb()
      .prepare(
        `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at)
         VALUES (?, ?, datetime('now','-10 days'), datetime('now','+4 days'), ?)`
      )
      .run(book, userId, returnedAt)
  }
}

function thisMonth(day: number): string {
  const now = new Date()
  const dd = String(day).padStart(2, '0')
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${dd} 09:00:00`
}

beforeEach(() => {
  initDb(':memory:')
  rankingService.invalidate()
})

describe('rankingService.topReaders', () => {
  it('이달 반납 권수 상위 n명을 순위와 함께 돌려준다', () => {
    const 일등 = insertUser('김일등')
    const 이등 = insertUser('이이등')
    const 삼등 = insertUser('박삼등')
    const 사등 = insertUser('최사등')
    returnLoans(일등, [thisMonth(1), thisMonth(2), thisMonth(3)])
    returnLoans(이등, [thisMonth(1), thisMonth(2)])
    returnLoans(삼등, [thisMonth(1), thisMonth(4)])
    returnLoans(사등, [thisMonth(1)])

    expect(rankingService.topReaders(3)).toEqual([
      { userId: 일등, rank: 1 },
      { userId: 이등, rank: 2 },
      { userId: 삼등, rank: 3 },
    ])
  })

  it('권수와 달성 시각이 모두 같으면 공동 순위가 된다', () => {
    const 가 = insertUser('가')
    const 나 = insertUser('나')
    returnLoans(가, [thisMonth(5)])
    returnLoans(나, [thisMonth(5)])

    expect(rankingService.topReaders(3).map((t) => t.rank)).toEqual([1, 1])
  })

  it('이달 반납이 없으면 빈 배열', () => {
    insertUser('김무독')

    expect(rankingService.topReaders(3)).toEqual([])
  })
})
