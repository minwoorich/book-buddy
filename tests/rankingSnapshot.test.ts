import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { rankingService, RANK_REFRESH_MS } from '../server/services/rankingService'

function insertUser(name: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES (?, '바텍', '개발본부', 'SW개발팀', '사원', 'M', 1996, 'member')`
    )
    .run(name)
  return Number(result.lastInsertRowid)
}

function insertBook(): number {
  const result = getDb()
    .prepare(`INSERT INTO books (title, author, category) VALUES ('책', '저자', '인문')`)
    .run()
  return Number(result.lastInsertRowid)
}

function insertReturnedLoan(userId: number, bookId: number): void {
  getDb()
    .prepare(
      `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at)
       VALUES (?, ?, datetime('now'), datetime('now', '+14 days'), datetime('now'))`
    )
    .run(bookId, userId)
}

beforeEach(() => {
  initDb(':memory:')
  rankingService.invalidate()
})

describe('rankingService.snapshot (QA #56 — 30분 스냅샷)', () => {
  it('같은 30분 구간 안에서는 새 반납이 생겨도 첫 조회 결과를 그대로 돌려준다', () => {
    const user = insertUser('민우')
    const book = insertBook()
    insertReturnedLoan(user, book)

    const t0 = 1_800_000_000_000 // 임의의 30분 경계(RANK_REFRESH_MS의 배수)
    expect(t0 % RANK_REFRESH_MS).toBe(0)
    const first = rankingService.snapshot('user', 'all', t0)
    expect(first.rows[0]?.count).toBe(1)

    insertReturnedLoan(user, book)
    const again = rankingService.snapshot('user', 'all', t0 + 10 * 60 * 1000)
    expect(again.rows[0]?.count).toBe(1) // 아직 갱신 전
    expect(again.updatedAt).toBe(first.updatedAt)
  })

  it('30분 구간이 바뀌면 다시 집계하고 updatedAt/nextUpdateAt이 경계 시각이다', () => {
    const user = insertUser('민우')
    const book = insertBook()
    insertReturnedLoan(user, book)

    const t0 = 1_800_000_000_000
    rankingService.snapshot('user', 'all', t0)
    insertReturnedLoan(user, book)

    const next = rankingService.snapshot('user', 'all', t0 + RANK_REFRESH_MS + 1000)
    expect(next.rows[0]?.count).toBe(2)
    expect(next.updatedAt).toBe(new Date(t0 + RANK_REFRESH_MS).toISOString())
    expect(next.nextUpdateAt).toBe(new Date(t0 + 2 * RANK_REFRESH_MS).toISOString())
  })

  it('by/period 조합마다 별도 스냅샷이고, invalidate()하면 즉시 재집계한다', () => {
    const user = insertUser('민우')
    const book = insertBook()
    insertReturnedLoan(user, book)

    const t0 = 1_800_000_000_000
    expect(rankingService.snapshot('user', 'all', t0).rows).toHaveLength(1)
    expect(rankingService.snapshot('team', 'all', t0).rows[0]?.label).toBe('SW개발팀')

    insertReturnedLoan(user, book)
    rankingService.invalidate()
    expect(rankingService.snapshot('user', 'all', t0).rows[0]?.count).toBe(2)
  })
})
