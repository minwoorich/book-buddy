import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { runMatcher } from '../server/services/clubMatcher'

// 아젠다 생성은 외부 API를 부르므로 매처 테스트에서는 고정값으로 대체한다.
vi.mock('../server/ai/clubAgenda', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/ai/clubAgenda')>()
  return {
    ...actual,
    generateAgenda: vi.fn(async () => [{ question: '고정 질문', evidence: [] }]),
  }
})

const NOW = new Date('2026-09-20T00:00:00Z')
const DEPS = { anthropicApiKey: 'test-key' }

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

/** 완독자 n명이 있는 책 하나를 만든다. */
function bookWithReaders(title: string, count: number, departments: string[] = []): number {
  const bookId = insertBook(title)
  for (let i = 0; i < count; i += 1) {
    const userId = insertUser(`${title}독자${i}`, departments[i] ?? '개발본부')
    insertReturnedLoan(bookId, userId, 5 + i)
  }
  return bookId
}

beforeEach(() => {
  initDb(':memory:')
})

describe('runMatcher', () => {
  it('완독자 3명인 책으로 제안을 만든다', async () => {
    bookWithReaders('하드씽', 3, ['개발본부', '영업본부', '연구소'])

    const result = await runMatcher(DEPS, NOW)

    expect(result.created).toBe(1)
    const club = clubRepo.findById(result.clubIds[0]!)!
    expect(club.status).toBe('proposed')
    expect(club.members).toHaveLength(3)
    expect(club.members.filter((m) => m.role === 'host')).toHaveLength(1)
    expect(club.agenda[0]?.question).toBe('고정 질문')
    expect(club.matchReason).not.toBe('')
    expect(club.inviteExpiresAt).not.toBeNull()
  })

  it('완독자가 2명뿐인 책은 건너뛴다', async () => {
    bookWithReaders('클린 코드', 2)
    expect((await runMatcher(DEPS, NOW)).created).toBe(0)
  })

  it('한 번 실행에 최대 2건까지만 만든다', async () => {
    bookWithReaders('책A', 3, ['개발본부', '영업본부', '연구소'])
    bookWithReaders('책B', 3, ['개발본부', '영업본부', '연구소'])
    bookWithReaders('책C', 3, ['개발본부', '영업본부', '연구소'])

    const result = await runMatcher(DEPS, NOW)
    expect(result.created).toBe(2)
  })

  it('연달아 실행해도 같은 사람을 또 묶지 않는다 (동시 1개 원칙)', async () => {
    bookWithReaders('하드씽', 3, ['개발본부', '영업본부', '연구소'])

    expect((await runMatcher(DEPS, NOW)).created).toBe(1)
    expect((await runMatcher(DEPS, NOW)).created).toBe(0)
  })

  it('완독자가 6명이면 5명으로 줄여 제안한다', async () => {
    bookWithReaders('하드씽', 6, ['개발본부', '영업본부', '연구소', '품질본부', '기획본부', '마케팅본부'])

    const result = await runMatcher(DEPS, NOW)
    expect(clubRepo.findById(result.clubIds[0]!)?.members).toHaveLength(5)
  })

  it('점수가 높은 책이 먼저 뽑힌다 (별점이 갈린 쪽)', async () => {
    const plain = bookWithReaders('밋밋한책', 3, ['개발본부', '영업본부', '연구소'])
    const split = bookWithReaders('논쟁적인책', 3, ['개발본부', '영업본부', '연구소'])

    // 논쟁적인책에만 갈리는 별점을 남긴다.
    const db = getDb()
    const readers = db.prepare(`SELECT user_id FROM loans WHERE book_id = ?`).all(split) as { user_id: number }[]
    const ratings = [5, 2, 4]
    readers.forEach((r, i) => {
      db.prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, ?, '리뷰')`).run(
        split, r.user_id, ratings[i]
      )
    })

    // 상한을 넘기려고 세 번째 책을 추가해 경쟁시킨다.
    bookWithReaders('또다른책', 3, ['개발본부', '영업본부', '연구소'])

    const result = await runMatcher(DEPS, NOW)
    const titles = result.clubIds.map((id) => clubRepo.findById(id)!.bookTitle)
    expect(titles).toContain('논쟁적인책')
    expect(plain).toBeGreaterThan(0)
  })
})
