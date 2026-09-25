import { describe, it, expect } from 'vitest'
import { groupClubsForUser, canViewClub } from '../server/utils/clubView'
import type { Club, ClubStatus } from '../shared/types'

function club(over: Partial<Club> & { id: number; status: ClubStatus }): Club {
  return {
    bookId: 1,
    bookTitle: '하드씽',
    bookCoverUrl: null,
    agenda: [],
    matchScore: 0.5,
    matchReason: '이유',
    candidateSlots: [],
    meetAt: null,
    inviteExpiresAt: null,
    voteExpiresAt: null,
    place: null,
    placeDecidedAt: null,
    createdAt: '2026-09-20T00:00:00Z',
    canceledReason: null,
    doneAt: null,
    votes: [],
    members: [
      { userId: 1, userName: '나', department: '개발본부', company: '바텍', role: 'member', inviteStatus: 'invited', respondedAt: null, completed: false, reading: false },
    ],
    origin: 'agent',
    createdBy: null,
    title: null,
    description: '',
    capacity: 5,
    recruitUntil: null,
    ...over,
  }
}

describe('groupClubsForUser', () => {
  it('아직 응답 안 한 inviting 모임은 invites로 간다', () => {
    const grouped = groupClubsForUser([club({ id: 1, status: 'inviting' })], 1)
    expect(grouped.invites.map((c) => c.id)).toEqual([1])
    expect(grouped.active).toHaveLength(0)
  })

  it('이미 수락한 inviting 모임은 invites가 아니라 active로 간다', () => {
    const c = club({
      id: 1,
      status: 'inviting',
      members: [
        { userId: 1, userName: '나', department: '개발본부', company: '바텍', role: 'member', inviteStatus: 'accepted', respondedAt: '2026-09-20T00:00:00Z', completed: false, reading: false },
      ],
    })
    const grouped = groupClubsForUser([c], 1)
    expect(grouped.invites).toHaveLength(0)
    expect(grouped.active.map((x) => x.id)).toEqual([1])
  })

  it('거절한 모임은 어디에도 올리지 않는다', () => {
    const c = club({
      id: 1,
      status: 'inviting',
      members: [
        { userId: 1, userName: '나', department: '개발본부', company: '바텍', role: 'member', inviteStatus: 'declined', respondedAt: '2026-09-20T00:00:00Z', completed: false, reading: false },
      ],
    })
    const grouped = groupClubsForUser([c], 1)
    expect(grouped.invites).toHaveLength(0)
    expect(grouped.active).toHaveLength(0)
    expect(grouped.past).toHaveLength(0)
  })

  it('scheduling: 수락했고 아직 투표 안 했으면 needsResponse', () => {
    const c = club({
      id: 1, status: 'scheduling',
      members: [{ userId: 1, userName: '나', department: '개발본부', company: '바텍', role: 'host', inviteStatus: 'accepted', respondedAt: 'x', completed: false, reading: false }],
    })
    expect(groupClubsForUser([c], 1).needsResponse.map((x) => x.id)).toEqual([1])
  })
  it('scheduling: 투표를 마쳤으면 active', () => {
    const c = club({
      id: 1, status: 'scheduling', votes: [{ userId: 1, slotIdx: 0 }],
      members: [{ userId: 1, userName: '나', department: '개발본부', company: '바텍', role: 'host', inviteStatus: 'accepted', respondedAt: 'x', completed: false, reading: false }],
    })
    const g = groupClubsForUser([c], 1)
    expect(g.needsResponse).toHaveLength(0)
    expect(g.active.map((x) => x.id)).toEqual([1])
  })
  it('scheduling: 응답하지 않은 채 기한이 지난 사람에게는 보이지 않는다', () => {
    const c = club({ id: 1, status: 'scheduling' }) // 기본 멤버는 invited
    const g = groupClubsForUser([c], 1)
    expect([...g.invites, ...g.needsResponse, ...g.active, ...g.past]).toHaveLength(0)
  })

  it('confirmed는 active, done·canceled는 past로 간다', () => {
    const accepted = {
      userId: 1, userName: '나', department: '개발본부', company: '바텍', role: 'member' as const,
      inviteStatus: 'accepted' as const, respondedAt: '2026-09-20T00:00:00Z', completed: false, reading: false,
    }
    const grouped = groupClubsForUser(
      [
        club({ id: 1, status: 'confirmed', members: [accepted] }),
        club({ id: 2, status: 'done', members: [accepted] }),
        club({ id: 3, status: 'canceled', members: [accepted] }),
      ],
      1
    )
    expect(grouped.active.map((c) => c.id)).toEqual([1])
    expect(grouped.past.map((c) => c.id)).toEqual([2, 3])
  })

  it('아직 승인 전(proposed)인 모임은 사용자에게 보이지 않는다', () => {
    const grouped = groupClubsForUser([club({ id: 1, status: 'proposed' })], 1)
    expect([...grouped.invites, ...grouped.needsResponse, ...grouped.active, ...grouped.past]).toHaveLength(0)
  })

  it('confirmed/done/canceled도 수락하지 않은 사람에게는 보이지 않는다', () => {
    for (const status of ['confirmed', 'done', 'canceled'] as const) {
      const g = groupClubsForUser([club({ id: 1, status })], 1) // 기본 멤버는 invited
      expect([...g.invites, ...g.needsResponse, ...g.active, ...g.past]).toHaveLength(0)
    }
  })
})

describe('canViewClub', () => {
  it('멤버는 볼 수 있다', () => {
    const c = club({ id: 1, status: 'inviting', origin: 'agent' })
    expect(canViewClub(c, { id: 1, role: 'member' })).toBe(true)
  })

  it('에이전트 모임은 멤버가 아니면 볼 수 없다', () => {
    const c = club({ id: 1, status: 'inviting', origin: 'agent' })
    expect(canViewClub(c, { id: 99, role: 'member' })).toBe(false)
  })

  it('사람 모임이 모집 중이면 멤버가 아니어도 볼 수 있다', () => {
    const c = club({ id: 1, status: 'inviting', origin: 'user' })
    expect(canViewClub(c, { id: 99, role: 'member' })).toBe(true)
  })

  it('사람 모임이라도 모집이 끝나면 멤버가 아니면 볼 수 없다', () => {
    const c = club({ id: 1, status: 'scheduling', origin: 'user' })
    expect(canViewClub(c, { id: 99, role: 'member' })).toBe(false)
  })

  it('관리자는 멤버가 아니어도 항상 볼 수 있다', () => {
    const c = club({ id: 1, status: 'confirmed', origin: 'agent' })
    expect(canViewClub(c, { id: 99, role: 'admin' })).toBe(true)
  })

  it('사람 모임이 확정돼도 멤버가 아닌 사람이 볼 수 있다(자리가 있으면 들어오게)', () => {
    const c = club({ id: 7, status: 'confirmed', origin: 'user' })
    expect(canViewClub(c, { id: 99, role: 'member' })).toBe(true)
  })
})
