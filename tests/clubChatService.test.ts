import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { notificationRepo } from '../server/repositories/notificationRepo'
import { clubChatService } from '../server/services/clubChatService'
import { clubStream } from '../server/utils/clubStream'
import { ApiError } from '../server/utils/errors'

const NOW = new Date('2026-09-25T05:00:00Z')   // 9/25 14:00 KST

function insertBook(): number {
  return Number(getDb().prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','저자','경제경영')`).run().lastInsertRowid)
}
function insertUser(name: string): number {
  return Number(getDb().prepare(`INSERT INTO users (name, company, department, team, position, gender, birth_year) VALUES (?, '바텍', '개발본부', '1팀', '사원', 'F', 1995)`).run(name).lastInsertRowid)
}
function setup() {
  const host = insertUser('개설자'), a = insertUser('a'), b = insertUser('b'), invited = insertUser('초대만'), outsider = insertUser('외부')
  const club = clubRepo.createUserClub({ bookId: insertBook(), createdBy: host, title: '같이', description: '', capacity: 5, recruitUntilIso: '2026-10-01T23:59:59.000Z' })
  clubRepo.upsertMember(club.id, a, 'member', 'accepted')
  clubRepo.upsertMember(club.id, b, 'member', 'accepted')
  clubRepo.upsertMember(club.id, invited, 'member', 'invited')
  return { club, host, a, b, invited, outsider }
}

beforeEach(() => { initDb(':memory:'); clubStream.reset() })

describe('clubChatService.send / list', () => {
  it('수락자만 보내고 읽는다; 길이 1~500; 끝난 모임은 읽기만; 보내면 구독자에게 발행', () => {
    const { club, host, a, invited, outsider } = setup()
    const got: string[] = []
    clubStream.subscribe(club.id, a, (m) => got.push(m.body))
    const m = clubChatService.send(club.id, host, '  안녕  ', NOW)
    expect(m).toMatchObject({ body: '안녕', kind: 'chat', userId: host })
    expect(got).toEqual(['안녕'])
    expect(() => clubChatService.send(club.id, invited, 'x', NOW)).toThrow(ApiError)
    expect(() => clubChatService.list(club.id, outsider, {})).toThrow(ApiError)
    expect(() => clubChatService.send(club.id, host, '   ', NOW)).toThrow(ApiError)
    expect(() => clubChatService.send(club.id, host, 'x'.repeat(501), NOW)).toThrow(/500/)
    expect(clubChatService.list(club.id, a, {}).map((x) => x.body)).toEqual(['안녕'])
    clubRepo.updateStatus(club.id, 'done')
    expect(() => clubChatService.send(club.id, host, '늦은', NOW)).toThrow(/끝난/)
    expect(clubChatService.list(club.id, a, {})).toHaveLength(1)
  })

  it('club_chat 알림 — 작성자·접속 중인 사람 제외, 모임당 KST 하루 1건, 시스템 메시지는 알림 없음', () => {
    const { club, host, a, b, invited } = setup()
    clubStream.subscribe(club.id, a, () => {})          // a는 보고 있다
    clubChatService.send(club.id, host, '1', NOW)
    clubChatService.send(club.id, host, '2', new Date('2026-09-25T10:00:00Z'))   // 같은 KST 날
    clubChatService.postSystem(club.id, '시스템')
    const chatOf = (u: number) => notificationRepo.listForUser(u).filter((n) => n.type === 'club_chat')
    expect(chatOf(b)).toHaveLength(1)
    expect(chatOf(b)[0]!.link).toBe(`/clubs/${club.id}?chat=2026-09-25`)
    expect(chatOf(a)).toHaveLength(0)
    expect(chatOf(host)).toHaveLength(0)
    expect(chatOf(invited)).toHaveLength(0)
    clubChatService.send(club.id, host, '3', new Date('2026-09-25T16:00:00Z'))   // 9/26 01:00 KST
    expect(chatOf(b)).toHaveLength(2)
  })

  it('markRead·postSystem', () => {
    const { club, host, a, outsider } = setup()
    const m = clubChatService.send(club.id, host, '1', NOW)
    clubChatService.markRead(club.id, a, m.id)
    expect(() => clubChatService.markRead(club.id, outsider, m.id)).toThrow(ApiError)
    const s = clubChatService.postSystem(club.id, 'a 님이 참여했어요')
    expect(s).toMatchObject({ kind: 'system', userId: null, body: 'a 님이 참여했어요' })
  })
})
