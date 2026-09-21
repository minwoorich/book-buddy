import type { Club } from '../../shared/types'

export interface GroupedClubs {
  /** 아직 수락/거절하지 않은 초대. */
  invites: Club[]
  /** 내 응답을 기다리는 진행 단계(시간 투표 등). */
  needsResponse: Club[]
  /** 참여가 확정돼 진행 중인 모임. */
  active: Club[]
  /** 끝났거나 취소된 모임. */
  past: Club[]
}

/**
 * 모임 목록을 화면의 네 묶음으로 나눈다.
 *
 * 관리자 승인 전(proposed)인 제안과 내가 거절한 모임은 어디에도 넣지 않는다 —
 * 전자는 아직 사람에게 알린 적이 없고, 후자는 이미 내 손을 떠났다.
 */
export function groupClubsForUser(clubs: Club[], userId: number): GroupedClubs {
  const grouped: GroupedClubs = { invites: [], needsResponse: [], active: [], past: [] }

  for (const club of clubs) {
    if (club.status === 'proposed') continue

    const me = club.members.find((m) => m.userId === userId)
    if (!me || me.inviteStatus === 'declined') continue

    if (club.status === 'done' || club.status === 'canceled') {
      grouped.past.push(club)
      continue
    }
    if (club.status === 'inviting') {
      if (me.inviteStatus === 'invited') grouped.invites.push(club)
      else grouped.active.push(club)
      continue
    }
    if (club.status === 'scheduling') {
      // 기한 안에 응답하지 않은 사람은 이 모임에 더 관여하지 않는다(상세는 볼 수 있다).
      if (me.inviteStatus !== 'accepted') continue
      const voted = club.votes.some((v) => v.userId === userId)
      ;(voted ? grouped.active : grouped.needsResponse).push(club)
      continue
    }
    grouped.active.push(club)
  }

  return grouped
}
