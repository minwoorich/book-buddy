import { clubRepo } from '../repositories/clubRepo'
import { notificationRepo } from '../repositories/notificationRepo'
import { CLUB_RULES } from '../utils/clubRules'
import { ApiError } from '../utils/errors'
import type { Club, ClubMember } from '../../shared/types'

function requireClub(clubId: number): Club {
  const club = clubRepo.findById(clubId)
  if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')
  return club
}

function acceptedMembers(club: Club): ClubMember[] {
  return club.members.filter((m) => m.inviteStatus === 'accepted')
}

/** 아직 거절하지 않은 사람 — 이 수가 최소 정원 밑으로 내려가면 모임은 성립할 수 없다. */
function stillPossible(club: Club): number {
  return club.members.filter((m) => m.inviteStatus !== 'declined').length
}

/**
 * 호스트가 거절했으면 수락자 중에서 다시 세운다. 수락자가 없으면 그대로 둔다 —
 * 어차피 정원 미달로 취소될 운명이라 여기서 억지로 정할 이유가 없다.
 */
function reassignHostIfNeeded(club: Club): void {
  const host = club.members.find((m) => m.role === 'host')
  if (host && host.inviteStatus !== 'declined') return

  const next = acceptedMembers(club)[0]
  if (next) clubRepo.setHost(club.id, next.userId)
}

/**
 * 정원 미달 취소 — 상태를 canceled로 바꾸고 수락자에게만 안내한다.
 * respond(즉시 미달)와 expireInvites(기한 만료)가 같은 문구를 쓰므로 한곳에 둔다.
 */
function cancelForLackOfMembers(club: Club, recipientIds: number[], reason: string): void {
  clubRepo.updateStatus(club.id, 'canceled', { canceledReason: reason })
  notificationRepo.insertMany(
    recipientIds,
    'club_canceled',
    `『${club.bookTitle}』 책모임이 열리지 않았어요`,
    '이번에는 인원이 모이지 않았어요. 다음 기회에 다시 제안드릴게요.',
    '/clubs'
  )
}

export const clubService = {
  /** 관리자 승인 — 여기서 처음으로 사람에게 초대가 나간다. */
  approveProposal(clubId: number): Club {
    const club = requireClub(clubId)
    if (club.status !== 'proposed') throw new ApiError(400, '이미 처리된 제안이에요')

    clubRepo.updateStatus(club.id, 'inviting')
    notificationRepo.insertMany(
      club.members.map((m) => m.userId),
      'club_invited',
      `『${club.bookTitle}』 책모임에 초대됐어요`,
      `같은 책을 읽은 ${club.members.length}명이 모입니다. 참여 여부를 알려주세요.`,
      `/clubs/${club.id}`
    )
    return clubRepo.findById(club.id)!
  },

  /** 관리자 거절 — 초대가 나간 적이 없으므로 아무에게도 알리지 않는다. */
  rejectProposal(clubId: number): void {
    const club = requireClub(clubId)
    if (club.status !== 'proposed') throw new ApiError(400, '이미 처리된 제안이에요')
    clubRepo.updateStatus(club.id, 'canceled', { canceledReason: '관리자가 제안을 거절했어요' })
  },

  /** 초대 수락/거절. 정원이 차면 조율중으로, 성립 불가가 확정되면 취소로 넘어간다. */
  respond(clubId: number, userId: number, accept: boolean): Club {
    const club = requireClub(clubId)
    if (club.status !== 'inviting') throw new ApiError(400, '지금은 응답할 수 있는 상태가 아니에요')

    const me = club.members.find((m) => m.userId === userId)
    if (!me) throw new ApiError(403, '초대받은 모임이 아니에요')
    if (me.inviteStatus !== 'invited') throw new ApiError(400, '이미 응답했어요')

    clubRepo.setInviteStatus(club.id, userId, accept ? 'accepted' : 'declined')
    const updated = requireClub(clubId)

    if (!accept) reassignHostIfNeeded(updated)

    const afterHostFix = requireClub(clubId)

    if (stillPossible(afterHostFix) < CLUB_RULES.minMembers) {
      cancelForLackOfMembers(
        club,
        acceptedMembers(afterHostFix).map((m) => m.userId),
        `정원(${CLUB_RULES.minMembers}명)을 채우지 못했어요`
      )
      return requireClub(clubId)
    }

    if (acceptedMembers(afterHostFix).length >= CLUB_RULES.minMembers) {
      clubRepo.updateStatus(club.id, 'scheduling')
      return requireClub(clubId)
    }

    return afterHostFix
  },

  /**
   * 응답 기한이 지난 초대를 정리한다. 처리한 모임 수를 돌려준다(주기 작업 로그용).
   * 수락이 정원을 채웠으면 조율중으로, 아니면 취소로 보낸다.
   */
  expireInvites(now: Date): number {
    const nowIso = now.toISOString()
    let handled = 0

    for (const club of clubRepo.listByStatus('inviting')) {
      if (!club.inviteExpiresAt || club.inviteExpiresAt > nowIso) continue
      handled += 1

      const accepted = acceptedMembers(club)
      if (accepted.length >= CLUB_RULES.minMembers) {
        clubRepo.updateStatus(club.id, 'scheduling')
        continue
      }

      cancelForLackOfMembers(
        club,
        accepted.map((m) => m.userId),
        `응답 기한(${CLUB_RULES.inviteDeadlineDays}일) 안에 정원을 채우지 못했어요`
      )
    }

    return handled
  },

  /**
   * 응답 기한이 하루 안으로 다가온 초대에 대해, 아직 응답하지 않은 사람에게만 알린다.
   * 알림을 보낸 사람 수를 돌려준다.
   *
   * 주기 작업이 하루에 여러 번 돌 수 있으므로(재시작·수동 실행) 이미 보낸 사람은
   * notificationRepo.has로 걸러 같은 리마인드가 쌓이지 않게 한다.
   */
  remindExpiringInvites(now: Date): number {
    const nowIso = now.toISOString()
    const soonIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    let sent = 0

    for (const club of clubRepo.listByStatus('inviting')) {
      if (!club.inviteExpiresAt) continue
      if (club.inviteExpiresAt <= nowIso || club.inviteExpiresAt > soonIso) continue

      const link = `/clubs/${club.id}`
      const targets = club.members.filter(
        (m) => m.inviteStatus === 'invited' && !notificationRepo.has(m.userId, 'club_invite_expiring', link)
      )
      if (targets.length === 0) continue

      notificationRepo.insertMany(
        targets.map((m) => m.userId),
        'club_invite_expiring',
        `『${club.bookTitle}』 책모임 응답이 내일 마감돼요`,
        '참여 여부를 알려주시면 모임을 확정할 수 있어요.',
        link
      )
      sent += targets.length
    }

    return sent
  },
}
