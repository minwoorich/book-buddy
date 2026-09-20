import { describe, it, expect } from 'vitest'
import { groupClubsForUser } from '../server/utils/clubView'
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
    members: [
      { userId: 1, userName: '나', department: '개발본부', role: 'member', inviteStatus: 'invited', respondedAt: null },
    ],
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
        { userId: 1, userName: '나', department: '개발본부', role: 'member', inviteStatus: 'accepted', respondedAt: '2026-09-20T00:00:00Z' },
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
        { userId: 1, userName: '나', department: '개발본부', role: 'member', inviteStatus: 'declined', respondedAt: '2026-09-20T00:00:00Z' },
      ],
    })
    const grouped = groupClubsForUser([c], 1)
    expect(grouped.invites).toHaveLength(0)
    expect(grouped.active).toHaveLength(0)
    expect(grouped.past).toHaveLength(0)
  })

  it('scheduling은 내 응답이 필요한 목록으로 간다 (2단계의 시간 투표 자리)', () => {
    const c = club({
      id: 1,
      status: 'scheduling',
      members: [
        { userId: 1, userName: '나', department: '개발본부', role: 'host', inviteStatus: 'accepted', respondedAt: '2026-09-20T00:00:00Z' },
      ],
    })
    expect(groupClubsForUser([c], 1).needsResponse.map((x) => x.id)).toEqual([1])
  })

  it('confirmed는 active, done·canceled는 past로 간다', () => {
    const accepted = {
      userId: 1, userName: '나', department: '개발본부', role: 'member' as const,
      inviteStatus: 'accepted' as const, respondedAt: '2026-09-20T00:00:00Z',
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
})
