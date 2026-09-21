import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { notificationRepo } from '../server/repositories/notificationRepo'
import { clubService } from '../server/services/clubService'
import { ApiError } from '../server/utils/errors'
import { formatKst } from '../shared/utils/clubTime'

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

  it('호스트가 거절하면 scheduling 진입 시 수락자 중에서 호스트를 다시 지정한다', () => {
    const { club, userIds } = makeProposal(4)
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[1]!, true)

    const after = clubService.respond(club.id, userIds[0]!, false)
    expect(after.status).toBe('inviting')

    clubService.respond(club.id, userIds[2]!, true)
    const final = clubService.respond(club.id, userIds[3]!, true)

    expect(final.status).toBe('scheduling')
    const host = final.members.find((m) => m.role === 'host')
    expect(host?.userId).toBe(userIds[1])
  })

  it('호스트가 먼저 거절하고 나머지가 수락해 정원이 차면, 수락자가 호스트가 된 채 scheduling으로 간다', () => {
    const { club, userIds } = makeProposal(4)
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[0]!, false)
    clubService.respond(club.id, userIds[1]!, true)
    clubService.respond(club.id, userIds[2]!, true)
    const after = clubService.respond(club.id, userIds[3]!, true)

    expect(after.status).toBe('scheduling')
    const host = after.members.find((m) => m.role === 'host')
    expect(host?.inviteStatus).toBe('accepted')
    expect(host?.userId).toBe(userIds[1])
    expect(after.members.filter((m) => m.role === 'host')).toHaveLength(1)
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

const NOW = new Date('2026-09-21T00:00:00Z') // 월 09:00 KST

/** 4명 제안을 승인하고 3명이 수락해 scheduling까지 보낸다. */
function scheduled() {
  const { club, userIds } = makeProposal(4)
  clubService.approveProposal(club.id)
  clubService.respond(club.id, userIds[0]!, true, NOW)
  clubService.respond(club.id, userIds[1]!, true, NOW)
  clubService.respond(club.id, userIds[2]!, true, NOW)
  return { club: clubRepo.findById(club.id)!, userIds }
}

describe('scheduling 진입', () => {
  it('후보 3개(시간순)·투표 마감·club_vote_request 알림이 생긴다', () => {
    const { club, userIds } = scheduled()
    expect(club.status).toBe('scheduling')
    expect(club.candidateSlots).toHaveLength(3)
    expect([...club.candidateSlots].sort()).toEqual(club.candidateSlots)
    expect(club.voteExpiresAt).not.toBeNull()
    // 마감은 첫 슬롯보다 하루 이상 앞선다
    expect(new Date(club.voteExpiresAt!).getTime()).toBeLessThanOrEqual(new Date(club.candidateSlots[0]!).getTime() - 24 * 60 * 60 * 1000)
    for (const u of userIds.slice(0, 3)) {
      expect(notificationRepo.listForUser(u)[0]?.type).toBe('club_vote_request')
    }
    expect(notificationRepo.listForUser(userIds[3]!).some((n) => n.type === 'club_vote_request')).toBe(false)
  })

  it('호스트가 수락자가 아니면 리뷰 쓴 수락자를 우선 호스트로 세운다', () => {
    const { club, userIds } = makeProposal(4)
    getDb().prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, 4, '리뷰')`).run(club.bookId, userIds[2])
    clubService.approveProposal(club.id)
    clubService.respond(club.id, userIds[0]!, false, NOW)
    clubService.respond(club.id, userIds[1]!, true, NOW)
    clubService.respond(club.id, userIds[2]!, true, NOW)
    const after = clubService.respond(club.id, userIds[3]!, true, NOW)
    expect(after.status).toBe('scheduling')
    expect(after.members.find((m) => m.role === 'host')?.userId).toBe(userIds[2])
  })

  it('가능한 시간이 하나도 없으면 취소하고 관리자에게만 알린다', () => {
    const admin = insertUser('도서관리자')
    getDb().prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(admin)
    const { club, userIds } = makeProposal(3)
    // 세 사람 모두 그 책을 아직 들고 있고 반납일이 다음 주 전이다 → 슬롯 0개
    for (const u of userIds) {
      getDb().prepare(`INSERT INTO loans (book_id, user_id, due_at) VALUES (?, ?, '2026-09-22T00:00:00.000Z')`).run(club.bookId, u)
    }
    clubService.approveProposal(club.id)
    userIds.forEach((u) => clubService.respond(club.id, u, true, NOW))

    const after = clubRepo.findById(club.id)!
    expect(after.status).toBe('canceled')
    expect(after.canceledReason).toContain('시간')
    expect(notificationRepo.listForUser(admin)[0]?.type).toBe('club_no_slots')
    expect(notificationRepo.listForUser(userIds[0]!).some((n) => n.type === 'club_canceled')).toBe(false)
  })
})

describe('clubService.vote', () => {
  it('수락자만, scheduling에서만, 유효한 인덱스만', () => {
    const { club, userIds } = scheduled()
    expect(() => clubService.vote(club.id, userIds[3]!, [0])).toThrow(ApiError) // 미응답자
    expect(() => clubService.vote(club.id, userIds[0]!, [7])).toThrow(ApiError) // 범위 밖
    expect(() => clubService.vote(club.id, userIds[0]!, [])).toThrow(ApiError) // 빈 선택
    const after = clubService.vote(club.id, userIds[0]!, [0, 1])
    expect(after.votes).toEqual([{ userId: userIds[0], slotIdx: 0 }, { userId: userIds[0], slotIdx: 1 }])
  })

  it('수락자 전원이 투표하면 즉시 최다 득표 슬롯으로 확정하고 club_confirmed를 보낸다', () => {
    const { club, userIds } = scheduled()
    clubService.vote(club.id, userIds[0]!, [1])
    clubService.vote(club.id, userIds[1]!, [1, 2])
    const after = clubService.vote(club.id, userIds[2]!, [2])
    expect(after.status).toBe('confirmed')
    expect(after.meetAt).toBe(club.candidateSlots[1])
    const n = notificationRepo.listForUser(userIds[0]!)[0]
    expect(n?.type).toBe('club_confirmed')
    expect(n?.body).toContain(formatKst(club.candidateSlots[1]!))
  })

  it('동점이면 가장 이른 슬롯', () => {
    const { club, userIds } = scheduled()
    clubService.vote(club.id, userIds[0]!, [2])
    clubService.vote(club.id, userIds[1]!, [0])
    const after = clubService.vote(club.id, userIds[2]!, [1])
    expect(after.meetAt).toBe(club.candidateSlots[0])
  })
})

describe('clubService.closeVotes', () => {
  it('마감이 지난 scheduling 모임을 확정한다 — 무투표면 첫 슬롯', () => {
    const { club } = scheduled()
    const closed = clubService.closeVotes(new Date(new Date(club.voteExpiresAt!).getTime() + 1000))
    expect(closed).toBe(1)
    const after = clubRepo.findById(club.id)!
    expect(after.status).toBe('confirmed')
    expect(after.meetAt).toBe(club.candidateSlots[0])
  })
  it('마감 전이면 건드리지 않는다', () => {
    const { club } = scheduled()
    expect(clubService.closeVotes(NOW)).toBe(0)
    expect(clubRepo.findById(club.id)!.status).toBe('scheduling')
  })
})

describe('clubService.remindTomorrow / finishPast', () => {
  function confirmedAt(meetAtIso: string) {
    const { club, userIds } = scheduled()
    clubRepo.confirm(club.id, meetAtIso)
    return { club: clubRepo.findById(club.id)!, userIds }
  }

  it('모임 24시간 안이면 참가자(수락자)에게 club_reminder를 한 번만 보낸다', () => {
    const { club, userIds } = confirmedAt('2026-09-22T09:30:00.000Z')
    const t = new Date('2026-09-21T10:00:00Z')
    expect(clubService.remindTomorrow(t)).toBe(3)
    expect(clubService.remindTomorrow(t)).toBe(0)
    expect(notificationRepo.listForUser(userIds[0]!)[0]?.type).toBe('club_reminder')
    expect(notificationRepo.listForUser(userIds[3]!).some((n) => n.type === 'club_reminder')).toBe(false)
    expect(clubRepo.findById(club.id)!.status).toBe('confirmed')
  })

  it('모임 시각이 지나면 done + done_at', () => {
    const { club } = confirmedAt('2026-09-22T09:30:00.000Z')
    expect(clubService.finishPast(new Date('2026-09-22T09:00:00Z'))).toBe(0)
    expect(clubService.finishPast(new Date('2026-09-22T12:00:00Z'))).toBe(1)
    const after = clubRepo.findById(club.id)!
    expect(after.status).toBe('done')
    expect(after.doneAt).toBe('2026-09-22T09:30:00.000Z')
  })
})
