import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { rankingService } from '../server/services/rankingService'

function insertUser(name: string, team = 'SW개발팀'): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES (?, '바텍', '개발본부', ?, '사원', 'M', 1996, 'member')`
    )
    .run(name, team)
  return Number(result.lastInsertRowid)
}

function insertBook(): number {
  const result = getDb()
    .prepare(`INSERT INTO books (title, author, category) VALUES ('책', '저자', '인문')`)
    .run()
  return Number(result.lastInsertRowid)
}

/** returnedAt은 'YYYY-MM-DD HH:MM:SS'(UTC) — 완독 시각을 직접 박아 순서를 만든다. */
function insertReturnedLoan(userId: number, returnedAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at)
       VALUES (?, ?, datetime(?, '-7 days'), datetime(?, '+7 days'), ?)`
    )
    .run(insertBook(), userId, returnedAt, returnedAt, returnedAt)
}

beforeEach(() => {
  initDb(':memory:')
  rankingService.invalidate()
})

describe('rankingService.rank — 동률 시 "먼저 n권을 채운 순서"(QA #93)', () => {
  it('권수가 같으면 n권째 완독이 빠른 사람이 앞선다', () => {
    const slow = insertUser('느린사람')
    const fast = insertUser('빠른사람')

    // 둘 다 2권. fast는 1월 5일에, slow는 3월 1일에 2권째를 채운다.
    insertReturnedLoan(fast, '2026-01-02 10:00:00')
    insertReturnedLoan(fast, '2026-01-05 10:00:00')
    insertReturnedLoan(slow, '2026-01-01 10:00:00')
    insertReturnedLoan(slow, '2026-03-01 10:00:00')

    const rows = rankingService.rank('user', 'all')
    expect(rows.map((r) => r.label)).toEqual(['빠른사람', '느린사람'])
    expect(rows[0].count).toBe(2)
    expect(rows[1].count).toBe(2)
  })

  it('권수가 다르면 권수가 우선이다(달성 시각이 늦어도 많이 읽은 쪽이 1위)', () => {
    const many = insertUser('많이')
    const few = insertUser('조금')

    insertReturnedLoan(few, '2026-01-01 10:00:00')
    insertReturnedLoan(many, '2026-05-01 10:00:00')
    insertReturnedLoan(many, '2026-05-02 10:00:00')

    const rows = rankingService.rank('user', 'all')
    expect(rows.map((r) => r.label)).toEqual(['많이', '조금'])
  })

  it('reachedAt은 집계 구간 안에서 count권째를 채운 시각이다', () => {
    const user = insertUser('민우')
    insertReturnedLoan(user, '2026-01-01 10:00:00')
    insertReturnedLoan(user, '2026-02-09 09:30:00')

    const rows = rankingService.rank('user', 'all')
    expect(rows[0].reachedAt).toBe('2026-02-09 09:30:00')
  })

  it('팀 랭킹도 같은 규칙으로 갈린다', () => {
    const a = insertUser('a', '가팀')
    const b = insertUser('b', '나팀')

    insertReturnedLoan(a, '2026-04-10 10:00:00')
    insertReturnedLoan(b, '2026-02-10 10:00:00')

    const rows = rankingService.rank('team', 'all')
    expect(rows.map((r) => r.label)).toEqual(['나팀', '가팀'])
  })
})
