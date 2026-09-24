import type { Club, GroupedClubs, User } from '../../shared/types'

export type { GroupedClubs }

/**
 * 모임 상세를 볼 수 있는지. 멤버(초대 상태 무관)이거나 관리자면 항상 가능하다.
 * 그 외에는 사람이 연 모임이 아직 모집 중(origin === 'user' && status === 'inviting')일 때만
 * 허용한다 — 모집 중에는 아젠다(동료 리뷰 인용)가 아직 없어 남에게 보여도 새어 나갈 게 없다.
 */
export function canViewClub(club: Pick<Club, 'origin' | 'status' | 'members'>, user: Pick<User, 'id' | 'role'>): boolean {
  if (club.members.some((m) => m.userId === user.id)) return true
  if (user.role === 'admin') return true
  return club.origin === 'user' && club.status === 'inviting'
}

/**
 * 모임 목록을 화면의 네 묶음으로 나눈다.
 *
 * 관리자 승인 전(proposed)인 제안과 내가 거절한 모임은 어디에도 넣지 않는다 —
 * 전자는 아직 사람에게 알린 적이 없고, 후자는 이미 내 손을 떠났다.
 * inviting을 지나 scheduling·confirmed·done·canceled로 넘어간 뒤에도, 기한 안에
 * 응답하지 않아 그 흐름에서 빠진 사람은 계속 보이지 않는다(상세는 볼 수 있다).
 */
export function groupClubsForUser(clubs: Club[], userId: number): GroupedClubs {
  const grouped: GroupedClubs = { invites: [], needsResponse: [], active: [], past: [] }

  for (const club of clubs) {
    if (club.status === 'proposed') continue

    const me = club.members.find((m) => m.userId === userId)
    if (!me || me.inviteStatus === 'declined') continue

    if (club.status === 'inviting') {
      if (me.inviteStatus === 'invited') grouped.invites.push(club)
      else grouped.active.push(club)
      continue
    }

    if (me.inviteStatus !== 'accepted') continue

    if (club.status === 'done' || club.status === 'canceled') {
      grouped.past.push(club)
      continue
    }
    if (club.status === 'scheduling') {
      const voted = club.votes.some((v) => v.userId === userId)
      ;(voted ? grouped.active : grouped.needsResponse).push(club)
      continue
    }
    grouped.active.push(club)
  }

  return grouped
}
