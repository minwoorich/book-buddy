import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { notificationRepo } from '../server/repositories/notificationRepo'
import { clubService } from '../server/services/clubService'
import { ApiError } from '../server/utils/errors'

function insertBook(): number {
  return Number(
    getDb().prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','저자','경제경영')`).run()
      .lastInsertRowid
  )
}

function insertUser(name: string): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO users (name, company, department, team, position, gender, birth_year)
         VALUES (?, '바텍', '개발본부', '1팀', '사원', 'F', 1995)`
      )
      .run(name).lastInsertRowid
  )
}

/** 호스트 1 + 멤버 n명짜리 제안. 반환값의 첫 원소가 호스트. */
function makeProposal(memberCount: number, inviteExpiresAt = '2026-09-23T00:00:00Z') {
  const bookId = insertBook()
  const userIds = Array.from({ length: memberCount }, (_, i) => insertUser(`독자${i}`))
  const club = clubRepo.insertProposal({
    bookId,
    matchScore: 0.5,
    matchReason: '이유',
    agenda: [],
    members: userIds.map((userId, i) => ({ userId, role: i === 0 ? ('host' as const) : ('member' as const) })),
    inviteExpiresAt,
  })
  return { club, userIds }
}

beforeEach(() => {
  initDb(':memory:')
})

describe('clubService.approveProposal', () => {
  it('proposed를 inviting으로 바꾸고 전원에게 초대 알림을 보낸다', () => {
    const { club, userIds } = makeProposal(3)

    const approved = clubService.approveProposal(club.id)

    expect(approved.status).toBe('inviting')
    for (const userId of userIds) {
      const items = notificationRepo.listForUser(userId)
      expect(items[0]?.type).toBe('club_invited')
      expect(items[0]?.link).toBe(`/clubs/${club.id}`)
    }
  })

  it('proposed가 아닌 모임은 400', () => {
    const { club } = makeProposal(3)
    clubService.approveProposal(club.id)
    expect(() => clubService.approveProposal(club.id)).toThrow(ApiError)
  })

  it('없는 모임은 404', () => {
    expect(() => clubService.approveProposal(999)).toThrow(ApiError)
  })
})

describe('clubService.rejectProposal', () => {
  it('canceled로 바꾸고 알림은 보내지 않는다 (초대가 나간 적이 없다)', () => {
    const { club, userIds } = makeProposal(3)
    clubService.rejectProposal(club.id)

    expect(clubRepo.findById(club.id)?.status).toBe('canceled')
    expect(notificationRepo.listForUser(userIds[0]!)).toHaveLength(0)
  })
})

describe('clubService.respond', () => {
  it('수락이 3명이 되면 scheduling으로 넘어간다', () => {
    const { club, userIds } = makeProposal(4)
    clubService.approveProposal(club.id)

    clubService.respond(club.id, userIds[0]!, true)
    expect(clubRepo.findById(club.id)?.status).toBe('inviting')
    clubService.respond(club.id, userIds[1]!, true)
    expect(clubRepo.findById(club.id)?.status).toBe('inviting')

    const after = clubService.respond(club.id, userIds[2]!, true)
    expect(after.status).toBe('scheduling')
  })

  it('거절로 남은 인원이 3명 미만이 되면 즉시 취소된다', () => {
    const { club, userIds } = makeProposal(3)
    clubService.approveProposal(club.id)

    const after = clubService.respond(club.id, userIds[0]!, false)
    expect(after.status).toBe('canceled')
    expect(after.canceledReason).toContain('정원')
  })

  it('호스트가 거절하면 수락자 중에서 호스트를 다시 지정한다', () => {
    const { club, userIds } = makeProposal(4)
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[1]!, true)

    const after = clubService.respond(club.id, userIds[0]!, false)
    const host = after.members.find((m) => m.role === 'host')
    expect(host?.userId).toBe(userIds[1])
  })

  it('멤버가 아닌 사람은 403', () => {
    const { club } = makeProposal(3)
    clubService.approveProposal(club.id)
    const stranger = insertUser('외부인')

    expect(() => clubService.respond(club.id, stranger, true)).toThrow(ApiError)
  })

  it('inviting 상태가 아니면 400', () => {
    const { club, userIds } = makeProposal(3)
    expect(() => clubService.respond(club.id, userIds[0]!, true)).toThrow(ApiError)
  })

  it('같은 사람이 두 번 응답하면 400', () => {
    const { club, userIds } = makeProposal(4)
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[0]!, true)

    expect(() => clubService.respond(club.id, userIds[0]!, true)).toThrow(ApiError)
  })
})

describe('clubService.expireInvites', () => {
  it('기한이 지났는데 수락이 3명 미만이면 취소하고 수락자에게만 알린다', () => {
    const { club, userIds } = makeProposal(4, '2026-09-19T00:00:00Z')
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[0]!, true)
    notificationRepo.markRead(userIds[0]!)

    const handled = clubService.expireInvites(new Date('2026-09-20T00:00:00Z'))

    expect(handled).toBe(1)
    expect(clubRepo.findById(club.id)?.status).toBe('canceled')
    expect(notificationRepo.listForUser(userIds[0]!)[0]?.type).toBe('club_canceled')
    // 응답조차 하지 않은 사람에게는 취소 알림을 보내지 않는다.
    expect(notificationRepo.listForUser(userIds[3]!).some((n) => n.type === 'club_canceled')).toBe(false)
  })

  it('기한이 지났고 수락이 3명 이상이면 scheduling으로 넘긴다', () => {
    const { club, userIds } = makeProposal(4, '2026-09-19T00:00:00Z')
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[0]!, true)
    clubService.respond(club.id, userIds[1]!, true)
    clubService.respond(club.id, userIds[2]!, true)

    // 이미 3명 수락으로 scheduling이 됐으므로 만료 대상이 아니다.
    expect(clubService.expireInvites(new Date('2026-09-20T00:00:00Z'))).toBe(0)
    expect(clubRepo.findById(club.id)?.status).toBe('scheduling')
  })

  it('기한 전이면 건드리지 않는다', () => {
    const { club } = makeProposal(4, '2026-09-25T00:00:00Z')
    clubService.approveProposal(club.id)

    expect(clubService.expireInvites(new Date('2026-09-20T00:00:00Z'))).toBe(0)
    expect(clubRepo.findById(club.id)?.status).toBe('inviting')
  })
})

describe('clubService.remindExpiringInvites', () => {
  it('마감 하루 전이면 아직 응답 안 한 사람에게만 알린다', () => {
    const { club, userIds } = makeProposal(3, '2026-09-21T00:00:00Z')
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[0]!, true)

    const sent = clubService.remindExpiringInvites(new Date('2026-09-20T09:00:00Z'))

    expect(sent).toBe(2)
    expect(notificationRepo.listForUser(userIds[1]!)[0]?.type).toBe('club_invite_expiring')
    // 이미 수락한 사람에게는 보내지 않는다.
    expect(notificationRepo.listForUser(userIds[0]!).some((n) => n.type === 'club_invite_expiring')).toBe(false)
  })

  it('마감이 아직 멀면 아무에게도 보내지 않는다', () => {
    const { club } = makeProposal(3, '2026-09-25T00:00:00Z')
    clubService.approveProposal(club.id)

    expect(clubService.remindExpiringInvites(new Date('2026-09-20T09:00:00Z'))).toBe(0)
  })

  it('같은 날 두 번 돌려도 알림이 중복되지 않는다', () => {
    const { club, userIds } = makeProposal(3, '2026-09-21T00:00:00Z')
    clubService.approveProposal(club.id)

    clubService.remindExpiringInvites(new Date('2026-09-20T09:00:00Z'))
    const second = clubService.remindExpiringInvites(new Date('2026-09-20T10:00:00Z'))

    expect(second).toBe(0)
    const reminders = notificationRepo.listForUser(userIds[0]!).filter((n) => n.type === 'club_invite_expiring')
    expect(reminders).toHaveLength(1)
  })
})
