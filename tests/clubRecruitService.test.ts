import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { notificationRepo } from '../server/repositories/notificationRepo'
import { clubRecruitService } from '../server/services/clubRecruitService'
import { clubService } from '../server/services/clubService'
import { ApiError } from '../server/utils/errors'

const NOW = new Date('2026-09-24T05:00:00Z')

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
function member(id: number, userId: number) { return clubRepo.findById(id)!.members.find((m) => m.userId === userId) }
function status(id: number) { return clubRepo.findById(id)!.status }

beforeEach(() => { initDb(':memory:') })

describe('clubRecruitService.create', () => {
  it('개설하면 inviting·origin=user·개설자 host/accepted·recruit_until은 +N일의 23:59:59Z', () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input(), NOW)
    expect(club).toMatchObject({ origin: 'user', status: 'inviting', createdBy: host, title: '하드씽 같이 읽어요', capacity: 5 })
    expect(club.recruitUntil).toBe('2026-10-01T23:59:59.000Z')
    expect(club.members[0]).toMatchObject({ userId: host, role: 'host', inviteStatus: 'accepted' })
    expect(notificationRepo.listForUser(host)).toHaveLength(0)
  })

  it('제목·정원·모집 기간·책을 검증한다', () => {
    const host = insertUser('개설자')
    expect(() => clubRecruitService.create(host, input({ title: '   ' }), NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, input({ title: 'x'.repeat(41) }), NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, input({ capacity: 2 }), NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, input({ capacity: 7 }), NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, input({ recruitDays: 5 }), NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, input({ description: 'x'.repeat(1001) }), NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, input({ bookId: 999 }), NOW)).toThrow(ApiError)
  })

  it('모집 중인 사람 모임을 호스트로 하나 갖고 있으면 두 번째는 400', () => {
    const host = insertUser('개설자')
    clubRecruitService.create(host, input(), NOW)
    expect(() => clubRecruitService.create(host, input(), NOW)).toThrow(/하나만/)
  })
})

describe('clubRecruitService.join / leave', () => {
  it('공개 참여 — accepted로 들어가고 호스트에게 club_joined, 정원이 차면 400, 중복 400', () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input({ capacity: 3 }), NOW)
    const a = insertUser('a'); const b = insertUser('b'); const c = insertUser('c')

    expect(member(clubRecruitService.join(club.id, a, NOW).id, a)).toMatchObject({ role: 'member', inviteStatus: 'accepted' })
    expect(notificationRepo.listForUser(host)[0]).toMatchObject({ type: 'club_joined', link: `/clubs/${club.id}` })
    expect(notificationRepo.listForUser(host)[0]!.title).toContain('(2/3)')
    expect(() => clubRecruitService.join(club.id, a, NOW)).toThrow(/이미/)
    clubRecruitService.join(club.id, b, NOW)
    expect(() => clubRecruitService.join(club.id, c, NOW)).toThrow(/정원/)
  })

  it('초대받은 사람이 참여를 누르면 수락 처리, 거절했던 사람은 다시 참여할 수 있다', () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input(), NOW)
    const a = insertUser('a')
    clubRecruitService.invite(club.id, host, [a])
    expect(member(club.id, a)!.inviteStatus).toBe('invited')
    clubRecruitService.join(club.id, a, NOW)
    expect(member(club.id, a)!.inviteStatus).toBe('accepted')

    clubRecruitService.leave(club.id, a)
    expect(member(club.id, a)).toBeUndefined()
    expect(notificationRepo.listForUser(host).some((n) => n.type === 'club_left')).toBe(true)
    clubRecruitService.join(club.id, a, NOW)
    expect(member(club.id, a)!.inviteStatus).toBe('accepted')
  })

  it('초대는 자리를 예약한다 — 초대 2명이 찬 상태에서 제3자는 참여할 수 없고, 한 명이 거절하면 참여할 수 있다', () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input({ capacity: 3 }), NOW)
    const x = insertUser('x'); const y = insertUser('y'); const z = insertUser('z')
    clubRecruitService.invite(club.id, host, [x, y])

    expect(() => clubRecruitService.join(club.id, z, NOW)).toThrow(/정원/)

    clubService.respond(club.id, x, false, NOW)
    clubRecruitService.join(club.id, z, NOW)
    expect(member(club.id, z)).toMatchObject({ role: 'member', inviteStatus: 'accepted' })
  })

  it('에이전트 모임·inviting이 아닌 모임엔 참여할 수 없고, 호스트는 참여 취소를 못 한다', () => {
    const host = insertUser('개설자')
    const a = insertUser('a')
    const agent = clubRepo.insertProposal({ bookId: insertBook(), matchScore: 0, matchReason: '', agenda: [], members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-30T23:59:59.000Z' })
    clubRepo.updateStatus(agent.id, 'inviting')
    expect(() => clubRecruitService.join(agent.id, host, NOW)).toThrow(/직접 연/)

    const club = clubRecruitService.create(host, input(), NOW)
    expect(() => clubRecruitService.leave(club.id, host)).toThrow(/개설자/)
    clubRepo.updateStatus(club.id, 'scheduling')
    expect(() => clubRecruitService.join(club.id, a, NOW)).toThrow(/모집 중/)
  })
})

describe('clubRecruitService.invite', () => {
  it('호스트만·정원 한도·기존 멤버 건너뜀·club_invited 발송', () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input({ capacity: 3 }), NOW)
    const a = insertUser('a'); const b = insertUser('b'); const c = insertUser('c')

    expect(() => clubRecruitService.invite(club.id, a, [b])).toThrow(ApiError)
    clubRecruitService.invite(club.id, host, [a, a])
    expect(member(club.id, a)!.inviteStatus).toBe('invited')
    expect(notificationRepo.listForUser(a)[0]).toMatchObject({ type: 'club_invited', link: `/clubs/${club.id}` })

    clubRecruitService.invite(club.id, host, [a, b])   // a는 이미 멤버 → 건너뜀, b만 추가(host+a+b = 3)
    expect(clubRepo.findById(club.id)!.members).toHaveLength(3)
    expect(() => clubRecruitService.invite(club.id, host, [c])).toThrow(/정원/)
    expect(() => clubRecruitService.invite(club.id, host, [])).toThrow(ApiError)
    expect(() => clubRecruitService.invite(club.id, host, [999])).toThrow(ApiError)
  })
})

describe('clubRecruitService.withdraw / adminCancel', () => {
  it('접기 — 호스트만·inviting만·참가자와 초대자에게 club_canceled', () => {
    const host = insertUser('개설자')
    const a = insertUser('a'); const b = insertUser('b')
    const club = clubRecruitService.create(host, input(), NOW)
    clubRecruitService.join(club.id, a, NOW)
    clubRecruitService.invite(club.id, host, [b])

    expect(() => clubRecruitService.withdraw(club.id, a)).toThrow(ApiError)
    const after = clubRecruitService.withdraw(club.id, host)
    expect(after.status).toBe('canceled')
    expect(after.canceledReason).toContain('접었')
    expect(notificationRepo.listForUser(a)[0]?.type).toBe('club_canceled')
    expect(notificationRepo.listForUser(b)[0]?.type).toBe('club_canceled')
    expect(notificationRepo.listForUser(host).some((n) => n.type === 'club_canceled')).toBe(false)
    expect(() => clubRecruitService.withdraw(club.id, host)).toThrow(ApiError)
  })

  it('관리자 닫기 — done·canceled가 아니면 어떤 모임이든 닫고 수락자에게 알린다', () => {
    const host = insertUser('개설자')
    const a = insertUser('a')
    const club = clubRecruitService.create(host, input(), NOW)
    clubRecruitService.join(club.id, a, NOW)
    clubRepo.updateStatus(club.id, 'confirmed')

    const after = clubRecruitService.adminCancel(club.id)
    expect(after.status).toBe('canceled')
    expect(after.canceledReason).toContain('관리자')
    expect(notificationRepo.listForUser(a)[0]?.type).toBe('club_canceled')
    expect(() => clubRecruitService.adminCancel(club.id)).toThrow(ApiError)
  })
})

const NO_LLM = { anthropicApiKey: '' }

describe('clubRecruitService.closeRecruiting', () => {
  it('호스트만·3명 이상 → invited는 declined·scheduling·아젠다(리뷰 없으면 폴백)·투표 요청', async () => {
    const host = insertUser('개설자')
    const a = insertUser('a'); const b = insertUser('b'); const c = insertUser('c')
    const club = clubRecruitService.create(host, input(), NOW)
    clubRecruitService.join(club.id, a, NOW)
    await expect(clubRecruitService.closeRecruiting(club.id, host, NO_LLM, NOW)).rejects.toThrow(/3명/)
    clubRecruitService.join(club.id, b, NOW)
    clubRecruitService.invite(club.id, host, [c])
    await expect(clubRecruitService.closeRecruiting(club.id, a, NO_LLM, NOW)).rejects.toThrow(ApiError)

    const after = await clubRecruitService.closeRecruiting(club.id, host, NO_LLM, NOW)
    expect(after.status).toBe('scheduling')
    expect(member(club.id, c)!.inviteStatus).toBe('declined')
    expect(after.agenda.length).toBeGreaterThan(0)
    expect(after.agenda.every((q) => q.evidence.length === 0)).toBe(true)
    expect(after.candidateSlots.length).toBeGreaterThan(0)
    expect(notificationRepo.listForUser(a)[0]?.type).toBe('club_vote_request')
    expect(notificationRepo.listForUser(c).some((n) => n.type === 'club_vote_request')).toBe(false)
    await expect(clubRecruitService.closeRecruiting(club.id, host, NO_LLM, NOW)).rejects.toThrow(/모집 중/)
  })
})

describe('clubRecruitService.expireRecruiting', () => {
  it('기한이 지난 모집은 3명 이상이면 scheduling, 미만이면 canceled + 알림; 기한 전엔 건드리지 않고 두 번 돌려도 멱등', async () => {
    const h1 = insertUser('h1'); const h2 = insertUser('h2'); const h3 = insertUser('h3')
    const a = insertUser('a'); const b = insertUser('b')
    const full = clubRecruitService.create(h1, input({ recruitDays: 3 }), NOW)     // 마감 9/27 23:59:59Z
    clubRecruitService.join(full.id, a, NOW); clubRecruitService.join(full.id, b, NOW)
    const short = clubRecruitService.create(h2, input({ recruitDays: 3 }), NOW)
    clubRecruitService.join(short.id, insertUser('x'), NOW)
    const fresh = clubRecruitService.create(h3, input({ recruitDays: 14 }), NOW)

    expect(await clubRecruitService.expireRecruiting(new Date('2026-09-27T00:00:00Z'), NO_LLM)).toBe(0)
    expect(await clubRecruitService.expireRecruiting(new Date('2026-09-28T00:00:00Z'), NO_LLM)).toBe(2)
    expect(status(full.id)).toBe('scheduling')
    expect(status(short.id)).toBe('canceled')
    expect(clubRepo.findById(short.id)!.canceledReason).toContain('3명')
    expect(status(fresh.id)).toBe('inviting')
    expect(notificationRepo.listForUser(h2)[0]?.type).toBe('club_canceled')
    expect(await clubRecruitService.expireRecruiting(new Date('2026-09-28T00:00:00Z'), NO_LLM)).toBe(0)
  })
})
