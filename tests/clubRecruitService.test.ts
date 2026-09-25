import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { notificationRepo } from '../server/repositories/notificationRepo'
import { clubMessageRepo } from '../server/repositories/clubMessageRepo'
import { clubRecruitService } from '../server/services/clubRecruitService'
import { clubService } from '../server/services/clubService'
import { ApiError } from '../server/utils/errors'

const NOW = new Date('2026-09-24T05:00:00Z')

function insertBook(): number {
  return Number(getDb().prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','저자','경제경영')`).run().lastInsertRowid)
}
function insertUser(name: string, isGuest = 0): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO users (name, company, department, team, position, gender, birth_year, is_guest) VALUES (?, '바텍', '개발본부', '1팀', '사원', 'F', 1995, ?)`
      )
      .run(name, isGuest).lastInsertRowid
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

  it('장소를 같이 보내면 개설과 함께 저장되고, 알림은 없다', () => {
    const host = insertUser('민우')
    const place = { kakaoId: 'k-star', name: '  스타벅스 광교점 ', lat: 37.29, lng: 127.05 }
    const club = clubRecruitService.create(host, { ...input(), place }, NOW)
    expect(club.place).toEqual({ ...place, name: '스타벅스 광교점' })
    expect(club.placeDecidedAt).toBe(NOW.toISOString())
    expect(club.status).toBe('inviting')
    expect(notificationRepo.listForUser(host)).toHaveLength(0)
    // 장소 없이도 그대로
    expect(clubRecruitService.create(insertUser('지훈'), { ...input(), place: null }, NOW).place).toBeNull()
  })

  it('장소가 비었거나 좌표가 틀리면 400이고 모임도 만들어지지 않는다', () => {
    const host = insertUser('민우')
    const good = { kakaoId: 'k-star', name: '스타벅스 광교점', lat: 37.29, lng: 127.05 }
    expect(() => clubRecruitService.create(host, { ...input(), place: { ...good, kakaoId: ' ' } }, NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, { ...input(), place: { ...good, name: '' } }, NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, { ...input(), place: { ...good, lat: NaN } }, NOW)).toThrow(ApiError)
    expect(() => clubRecruitService.create(host, { ...input(), place: { ...good, lng: 181 } }, NOW)).toThrow(ApiError)
    expect(clubRepo.hostingRecruitingCount(host)).toBe(0)
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

  it('초대는 자리를 잡아둔다 — 초대 2명이 찬 상태에서 제3자는 참여할 수 없고, 한 명이 거절하면 참여할 수 있다', () => {
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

  it('게스트는 초대할 수 없다', () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input(), NOW)
    const guest = insertUser('게스트', 1)
    expect(() => clubRecruitService.invite(club.id, host, [guest])).toThrow(/게스트/)
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

  it('관리자 닫기 — proposed(승인 전) 모임은 400이고 아무에게도 알리지 않는다', () => {
    const a = insertUser('a')
    const proposal = clubRepo.insertProposal({
      bookId: insertBook(),
      matchScore: 0,
      matchReason: '',
      agenda: [],
      members: [{ userId: a, role: 'host' }],
      inviteExpiresAt: '2026-09-30T23:59:59.000Z',
    })
    expect(proposal.status).toBe('proposed')

    expect(() => clubRecruitService.adminCancel(proposal.id)).toThrow(/승인 전/)
    expect(notificationRepo.listForUser(a)).toHaveLength(0)
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

  it('동시에 두 번 닫아도 재진입 방어로 투표 요청 알림이 중복되지 않는다', async () => {
    const host = insertUser('개설자')
    const a = insertUser('a'); const b = insertUser('b')
    const club = clubRecruitService.create(host, input(), NOW)
    clubRecruitService.join(club.id, a, NOW)
    clubRecruitService.join(club.id, b, NOW)

    const results = await Promise.allSettled([
      clubRecruitService.closeRecruiting(club.id, host, NO_LLM, NOW),
      clubRecruitService.closeRecruiting(club.id, host, NO_LLM, NOW),
    ])
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true)

    expect(status(club.id)).toBe('scheduling')
    expect(notificationRepo.listForUser(a).filter((n) => n.type === 'club_vote_request')).toHaveLength(1)
    expect(clubRepo.findById(club.id)!.candidateSlots.length).toBeGreaterThan(0)
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

  it('recruitUntil이 now와 정확히 같으면(경계) 만료로 처리한다', async () => {
    const host = insertUser('h')
    const nowIso = new Date('2026-09-28T00:00:00Z').toISOString()
    const club = clubRepo.createUserClub({ bookId: insertBook(), createdBy: host, title: '하드씽 같이 읽어요', description: '', capacity: 5, recruitUntilIso: nowIso })

    expect(await clubRecruitService.expireRecruiting(new Date(nowIso), NO_LLM)).toBe(1)
    expect(status(club.id)).toBe('canceled')
  })
})

const S1 = '2026-09-29T09:30:00.000Z', S2 = '2026-10-01T09:30:00.000Z', S3 = '2026-10-02T09:30:00.000Z'

describe('clubRecruitService.closeRecruiting — 후보가 있으면', () => {
  it('400 — "시간 확정"을 써야 한다', async () => {
    const host = insertUser('개설자'); const a = insertUser('a'); const b = insertUser('b')
    const club = clubRecruitService.create(host, { ...input(), candidateSlots: [S1, S2] }, NOW)
    clubRecruitService.join(club.id, a, NOW); clubRecruitService.join(club.id, b, NOW)
    await expect(clubRecruitService.closeRecruiting(club.id, host, NO_LLM, NOW)).rejects.toThrow(/시간 확정/)
  })
})

describe('clubRecruitService.leave — 표 삭제', () => {
  it('나간 사람의 표는 지워진다 — a의 S1 표가 사라지면 host의 S2 표만 남아 S2로 확정된다', async () => {
    const host = insertUser('개설자'); const a = insertUser('a'); const b = insertUser('b')
    const club = clubRecruitService.create(host, { ...input({ capacity: 3 }), candidateSlots: [S1, S2] }, NOW)
    clubRecruitService.join(club.id, a, NOW); clubRecruitService.join(club.id, b, NOW)
    clubService.vote(club.id, a, [0], NOW)      // S1
    clubService.vote(club.id, host, [1], NOW)   // S2

    clubRecruitService.leave(club.id, a, NOW)

    const after = await clubRecruitService.confirm(club.id, host, NO_LLM, {}, NOW)
    expect(after.meetAt).toBe(S2)
  })
})

describe('clubRecruitService.create — 후보 시간', () => {
  it('후보를 내면 정렬돼 저장되고, 잘못된 후보는 400', () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, { ...input(), candidateSlots: [S2, S1] }, NOW)
    expect(club.candidateSlots).toEqual([S1, S2])
    expect(() => clubRecruitService.create(insertUser('h2'), { ...input(), candidateSlots: ['2026-09-01T09:30:00.000Z'] }, NOW)).toThrow(/지난/)
  })
})

describe('clubRecruitService.setCandidates', () => {
  it('개설자만·모집 중만; 남은 후보의 표는 유지되고 사라진 후보의 표는 삭제; 시스템 메시지', () => {
    const host = insertUser('개설자'); const a = insertUser('a')
    const club = clubRecruitService.create(host, { ...input(), candidateSlots: [S1, S2] }, NOW)
    clubRecruitService.join(club.id, a, NOW)
    clubService.vote(club.id, a, [0, 1], NOW)
    expect(() => clubRecruitService.setCandidates(club.id, a, [S1], NOW)).toThrow(ApiError)

    const after = clubRecruitService.setCandidates(club.id, host, [S2, S3], NOW)
    expect(after.candidateSlots).toEqual([S2, S3])
    expect(after.votes).toEqual([{ userId: a, slotIdx: 0 }])
    const sys = clubMessageRepo.listBefore(club.id, null, 10).filter((m) => m.kind === 'system')
    expect(sys.at(-1)!.body).toContain('후보 시간을 고쳤어요')
    clubRepo.updateStatus(club.id, 'confirmed')
    expect(() => clubRecruitService.setCandidates(club.id, host, [S3], NOW)).toThrow(/모집 중/)
  })
})

describe('clubRecruitService.confirm', () => {
  it('개설자만·후보 없으면 400 안내·기본은 최다 득표·1명이어도 확정·알림·시스템 메시지·조율 단계 없음', async () => {
    const host = insertUser('개설자'); const a = insertUser('a'); const b = insertUser('b')
    const noSlots = clubRecruitService.create(host, input(), NOW)
    await expect(clubRecruitService.confirm(noSlots.id, host, NO_LLM, {}, NOW)).rejects.toThrow(/후보 시간이 없어요/)
    clubRepo.updateStatus(noSlots.id, 'canceled')

    const club = clubRecruitService.create(host, { ...input(), candidateSlots: [S1, S2] }, NOW)
    clubRecruitService.join(club.id, a, NOW); clubRecruitService.join(club.id, b, NOW)
    clubRecruitService.invite(club.id, host, [insertUser('c')], NOW)
    clubService.vote(club.id, a, [1], NOW); clubService.vote(club.id, b, [1], NOW); clubService.vote(club.id, host, [0], NOW)
    await expect(clubRecruitService.confirm(club.id, a, NO_LLM, {}, NOW)).rejects.toThrow(ApiError)

    const after = await clubRecruitService.confirm(club.id, host, NO_LLM, {}, NOW)
    expect(after.status).toBe('confirmed')
    expect(after.meetAt).toBe(S2)
    expect(after.members.find((m) => m.userName === 'c')!.inviteStatus).toBe('declined')
    expect(after.agenda.length).toBeGreaterThan(0)
    expect(notificationRepo.listForUser(a)[0]).toMatchObject({ type: 'club_confirmed', link: `/clubs/${club.id}` })
    expect(clubMessageRepo.listBefore(club.id, null, 10).some((m) => m.kind === 'system' && m.body.includes('시간이 정해졌어요'))).toBe(true)
    await expect(clubRecruitService.confirm(club.id, host, NO_LLM, {}, NOW)).rejects.toThrow(/모집 중/)
  })

  it('지정 슬롯으로 확정; 후보 밖·지난 슬롯은 400; 혼자여도 된다', async () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, { ...input(), candidateSlots: [S1, S2] }, NOW)
    await expect(clubRecruitService.confirm(club.id, host, NO_LLM, { slot: S3 }, NOW)).rejects.toThrow(/없는 시간/)
    await expect(clubRecruitService.confirm(club.id, host, NO_LLM, { slot: S1 }, new Date('2026-09-30T00:00:00Z'))).rejects.toThrow(/지난/)
    const after = await clubRecruitService.confirm(club.id, host, NO_LLM, { slot: S1 }, NOW)
    expect(after).toMatchObject({ status: 'confirmed', meetAt: S1 })
  })

  it('미래 후보가 하나도 없으면 400', async () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, { ...input(), candidateSlots: [S1] }, NOW)
    await expect(clubRecruitService.confirm(club.id, host, NO_LLM, {}, new Date('2026-10-05T00:00:00Z'))).rejects.toThrow(/지난 시간/)
  })
})

describe('clubRecruitService — 확정 후 참여 창', () => {
  async function confirmedClub() {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, { ...input({ capacity: 3 }), candidateSlots: [S1] }, NOW)
    await clubRecruitService.confirm(club.id, host, NO_LLM, {}, NOW)
    return { club, host }
  }
  it('확정 뒤 모임 전날까지·정원 미만이면 참여·취소·초대가 되고 새 참가자에게 확정 알림이 간다', async () => {
    const { club, host } = await confirmedClub()
    const a = insertUser('a'); const b = insertUser('b'); const c = insertUser('c')
    const joined = clubRecruitService.join(club.id, a, NOW)
    expect(member(joined.id, a)!.inviteStatus).toBe('accepted')
    expect(notificationRepo.listForUser(a)[0]).toMatchObject({ type: 'club_confirmed' })
    expect(notificationRepo.listForUser(host).some((n) => n.type === 'club_joined')).toBe(true)
    clubRecruitService.invite(club.id, host, [b], NOW)
    expect(() => clubRecruitService.join(club.id, c, NOW)).toThrow(/정원/)
    clubRecruitService.leave(club.id, a, NOW)
    expect(member(club.id, a)).toBeUndefined()
    expect(() => clubRecruitService.leave(club.id, host, NOW)).toThrow(/개설자/)
  })
  it('모임 KST 당일부터는 닫힌다', async () => {
    const { club } = await confirmedClub()
    const a = insertUser('a')
    expect(() => clubRecruitService.join(club.id, a, new Date('2026-09-29T00:30:00Z'))).toThrow(/모집 중|닫혔/)
  })
  it('scheduling·done에서는 여전히 안 된다', async () => {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, input(), NOW)
    clubRepo.updateStatus(club.id, 'done')
    expect(() => clubRecruitService.join(club.id, insertUser('a'), NOW)).toThrow(ApiError)
  })
})

describe('확정 뒤 초대 수락 — respond가 참여 창을 따른다', () => {
  async function confirmedClub() {
    const host = insertUser('개설자')
    const club = clubRecruitService.create(host, { ...input({ capacity: 3 }), candidateSlots: [S1] }, NOW)
    await clubRecruitService.confirm(club.id, host, NO_LLM, {}, NOW)
    return { club, host }
  }
  it('초대받은 사람이 확정 뒤 참여를 누르면 수락되고 확정 알림·시스템 메시지가 간다', async () => {
    const { club, host } = await confirmedClub()
    const b = insertUser('b')
    clubRecruitService.invite(club.id, host, [b], NOW)
    const joined = clubRecruitService.join(club.id, b, NOW)
    expect(member(joined.id, b)!.inviteStatus).toBe('accepted')
    expect(notificationRepo.listForUser(b)[0]).toMatchObject({ type: 'club_confirmed' })
    expect(clubMessageRepo.listBefore(club.id, null, 10).some((m) => m.kind === 'system' && m.body.includes('b 님이 참여했어요'))).toBe(true)
  })
  it('clubService.respond로 직접 수락해도 같다', async () => {
    const { club, host } = await confirmedClub()
    const b = insertUser('b')
    clubRecruitService.invite(club.id, host, [b], NOW)
    const after = clubService.respond(club.id, b, true, NOW)
    expect(member(after.id, b)!.inviteStatus).toBe('accepted')
    expect(notificationRepo.listForUser(b)[0]).toMatchObject({ type: 'club_confirmed' })
  })
  it('확정된 모임에서 거절해도 에러 없이 declined로 남는다', async () => {
    const { club, host } = await confirmedClub()
    const b = insertUser('b')
    clubRecruitService.invite(club.id, host, [b], NOW)
    const after = clubService.respond(club.id, b, false, NOW)
    expect(member(after.id, b)!.inviteStatus).toBe('declined')
  })
  it('모임 KST 당일부터는 응답할 수 없다', async () => {
    const { club, host } = await confirmedClub()
    const b = insertUser('b')
    clubRecruitService.invite(club.id, host, [b], NOW)
    expect(() => clubService.respond(club.id, b, true, new Date('2026-09-29T00:30:00Z'))).toThrow(ApiError)
  })
})

describe('clubRecruitService.expireRecruiting — 후보 있음', () => {
  it('2명 이상이면 자동 확정, 개설자뿐이면 취소, 후보 없음은 기존 규칙', async () => {
    const h1 = insertUser('h1'); const h2 = insertUser('h2'); const h3 = insertUser('h3')
    const two = clubRecruitService.create(h1, { ...input({ recruitDays: 3 }), candidateSlots: [S2] }, NOW)   // 마감 9/27
    clubRecruitService.join(two.id, insertUser('a'), NOW)
    const alone = clubRecruitService.create(h2, { ...input({ recruitDays: 3 }), candidateSlots: [S2] }, NOW)
    const legacy = clubRecruitService.create(h3, input({ recruitDays: 3 }), NOW)
    clubRecruitService.join(legacy.id, insertUser('x'), NOW); clubRecruitService.join(legacy.id, insertUser('y'), NOW)

    expect(await clubRecruitService.expireRecruiting(new Date('2026-09-28T00:00:00Z'), NO_LLM)).toBe(3)
    expect(status(two.id)).toBe('confirmed'); expect(clubRepo.findById(two.id)!.meetAt).toBe(S2)
    expect(status(alone.id)).toBe('canceled'); expect(clubRepo.findById(alone.id)!.canceledReason).toContain('아무도')
    expect(status(legacy.id)).toBe('scheduling')
  })
})
