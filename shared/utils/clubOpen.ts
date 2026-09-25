import type { Club } from '../types'
import { placeLocked } from './clubTime'

type MemberLike = { inviteStatus: string }

/** 자리를 잡아둔 사람 수 — 수락 + 응답 대기 초대(초대가 자리를 예약한다). */
export function reservedCount(club: { members: MemberLike[] }): number {
  return club.members.filter((m) => m.inviteStatus === 'accepted' || m.inviteStatus === 'invited').length
}

export function hasSeat(club: { capacity: number; members: MemberLike[] }): boolean {
  return reservedCount(club) < club.capacity
}

/**
 * 사람 모임에 들어올(나갈·초대할) 수 있는 창 — 모집 중이거나, 확정됐지만 모임 KST 당일 전.
 * "전날까지"의 경계는 장소 잠금(placeLocked)과 같다.
 */
export function joinWindowOpen(club: Pick<Club, 'origin' | 'status' | 'meetAt'>, now: Date): boolean {
  if (club.origin !== 'user') return false
  if (club.status === 'inviting') return true
  if (club.status === 'confirmed') return !placeLocked(club, now)
  return false
}
