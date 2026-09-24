import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { clubRecruitService } from '../server/services/clubRecruitService'
import { runAllDeadlines } from '../server/services/clubDeadlines'

const NOW = new Date('2026-09-24T05:00:00Z')
const NO_LLM = { anthropicApiKey: '' }

function insertBook(): number {
  return Number(getDb().prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','저자','경제경영')`).run().lastInsertRowid)
}
function insertUser(name: string): number {
  return Number(
    getDb()
      .prepare(`INSERT INTO users (name, company, department, team, position, gender, birth_year) VALUES (?, '바텍', '개발본부', '1팀', '사원', 'F', 1995)`)
      .run(name).lastInsertRowid
  )
}
function input(over: Partial<{ bookId: number; title: string; description: string; capacity: number; recruitDays: number }> = {}) {
  return { bookId: insertBook(), title: '하드씽 같이 읽어요', description: '실패담 위주로 이야기해요', capacity: 5, recruitDays: 7, ...over }
}

beforeEach(() => { initDb(':memory:') })

describe('runAllDeadlines', () => {
  it('모집 만료 수를 포함한 전체 결과를 돌려준다', async () => {
    await expect(runAllDeadlines(new Date('2026-09-24T00:00:00Z'), { anthropicApiKey: '' })).resolves.toEqual({
      recruitExpired: 0, handled: 0, closed: 0, finished: 0, reminded: 0, remindedTomorrow: 0, reviewRequested: 0,
    })
  })

  it('만료된 사람 모임의 recruitExpired가 실제로 결과에 전달된다(I-5 — 순서 뒤집힘 회귀 방지)', async () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input({ recruitDays: 3 }), NOW)

    const result = await runAllDeadlines(new Date('2026-09-28T00:00:00Z'), NO_LLM)

    expect(result.recruitExpired).toBe(1)
    expect(clubRepo.findById(club.id)!.status).toBe('canceled')
  })
})
