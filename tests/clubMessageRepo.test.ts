import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { clubMessageRepo } from '../server/repositories/clubMessageRepo'

function insertBook(): number {
  return Number(getDb().prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','저자','경제경영')`).run().lastInsertRowid)
}
function insertUser(name: string): number {
  return Number(getDb().prepare(`INSERT INTO users (name, company, department, team, position, gender, birth_year) VALUES (?, '바텍', '개발본부', '1팀', '사원', 'F', 1995)`).run(name).lastInsertRowid)
}
function club(hostId: number) {
  return clubRepo.createUserClub({ bookId: insertBook(), createdBy: hostId, title: '같이', description: '', capacity: 5, recruitUntilIso: '2026-10-01T23:59:59.000Z' })
}

beforeEach(() => { initDb(':memory:') })

describe('clubMessageRepo', () => {
  it('insert·listBefore — 오래된 → 최신, before로 위로, 시스템 메시지는 userName null', () => {
    const host = insertUser('개설자'); const a = insertUser('a')
    const c = club(host)
    const m1 = clubMessageRepo.insert(c.id, host, 'chat', '안녕')
    const s = clubMessageRepo.insert(c.id, null, 'system', 'a 님이 참여했어요')
    const m3 = clubMessageRepo.insert(c.id, a, 'chat', '반가워요')
    expect(m1).toMatchObject({ clubId: c.id, userId: host, userName: '개설자', department: '개발본부', kind: 'chat', body: '안녕' })
    expect(s).toMatchObject({ userId: null, userName: null, department: null, kind: 'system' })
    expect(clubMessageRepo.listBefore(c.id, null, 50).map((m) => m.id)).toEqual([m1.id, s.id, m3.id])
    expect(clubMessageRepo.listBefore(c.id, m3.id, 50).map((m) => m.id)).toEqual([m1.id, s.id])
    expect(clubMessageRepo.listBefore(c.id, null, 2).map((m) => m.id)).toEqual([s.id, m3.id])
  })

  it('markRead는 뒤로 가지 않고, unreadCounts는 chat만·내 메시지 제외', () => {
    const host = insertUser('개설자'); const a = insertUser('a')
    const c = club(host); const d = club(insertUser('h2'))
    const m1 = clubMessageRepo.insert(c.id, host, 'chat', '1')
    clubMessageRepo.insert(c.id, null, 'system', 'sys')
    const m3 = clubMessageRepo.insert(c.id, host, 'chat', '3')
    clubMessageRepo.insert(c.id, a, 'chat', 'mine')
    clubMessageRepo.insert(d.id, host, 'chat', 'other club')

    expect(clubMessageRepo.unreadCounts(a, [c.id, d.id]).get(c.id)).toBe(2)
    clubMessageRepo.markRead(c.id, a, m1.id)
    expect(clubMessageRepo.unreadCounts(a, [c.id]).get(c.id)).toBe(1)
    clubMessageRepo.markRead(c.id, a, 0)                       // 뒤로 안 감
    expect(clubMessageRepo.unreadCounts(a, [c.id]).get(c.id)).toBe(1)
    clubMessageRepo.markRead(c.id, a, m3.id)
    expect(clubMessageRepo.unreadCounts(a, [c.id]).get(c.id) ?? 0).toBe(0)
    expect(clubMessageRepo.unreadCounts(a, []).size).toBe(0)
  })
})
