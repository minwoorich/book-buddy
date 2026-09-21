import { clubRepo } from '../repositories/clubRepo'
import { notificationRepo } from '../repositories/notificationRepo'
import { CLUB_RULES } from '../utils/clubRules'
import { ApiError } from '../utils/errors'
import { generateCandidateSlots, kstParts } from '../utils/clubSlots'
import { formatKst } from '../../shared/utils/clubTime'
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
 * scheduling으로 넘어가기 직전에 호스트가 수락자인지 보장한다. 아니면 수락자 중
 * 그 책에 리뷰를 쓴 사람을 먼저, 없으면 첫 수락자를 호스트로 세운다(스펙 §6).
 */
function ensureAcceptedHost(club: Club): void {
  const host = club.members.find((m) => m.role === 'host')
  if (host && host.inviteStatus === 'accepted') return
  const accepted = acceptedMembers(club)
  const reviewers = clubRepo.reviewerIdsFor(club.bookId, accepted.map((m) => m.userId))
  const next = accepted.find((m) => reviewers.has(m.userId)) ?? accepted[0]
  if (next) clubRepo.setHost(club.id, next.userId)
}

/** 그날의 끝(23:59:59 UTC) — 매처·기한 작업이 도는 00:00 UTC와 겹치지 않게 하는 관례(1단계). */
function endOfDayUtc(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(23, 59, 59, 0)
  return d
}

/** 같은 KST 달력 날짜인가 — 리마인드는 "모임 전날"이라는 날짜 개념이지 24시간 창이 아니다. */
function sameKstDate(a: Date, b: Date): boolean {
  const p = kstParts(a)
  const q = kstParts(b)
  return p.y === q.y && p.m === q.m && p.d === q.d
}

/**
 * 조율중 진입 — 호스트 보장, 충돌 회피 슬롯 생성, 투표 마감 설정, 투표 요청 알림.
 * 슬롯이 하나도 안 나오면 모임을 취소하고 관리자에게만 알린다(스펙 §12).
 */
function enterScheduling(club: Club, now: Date): void {
  ensureAcceptedHost(club)
  const accepted = acceptedMembers(club)
  const ids = accepted.map((m) => m.userId)
  const slots = generateCandidateSlots({
    now,
    busy: clubRepo.busyIntervalsFor(ids, club.id),
    mustEndBefore: clubRepo.earliestDueAtFor(club.bookId, ids),
    preferEvening: new Set(accepted.map((m) => m.company)).size > 1,
  })

  if (slots.length === 0) {
    clubRepo.updateStatus(club.id, 'canceled', { canceledReason: '가능한 시간을 찾지 못했어요' })
    notificationRepo.insertMany(
      clubRepo.adminUserIds(),
      'club_no_slots',
      `『${club.bookTitle}』 책모임이 시간을 찾지 못해 취소됐어요`,
      '참가자 일정과 반납 예정일이 겹쳐 다음 주 후보가 없었어요.',
      '/admin'
    )
    return
  }

  const byDeadline = endOfDayUtc(new Date(now.getTime() + CLUB_RULES.voteDeadlineDays * 24 * 60 * 60 * 1000))
  const beforeFirstSlot = new Date(new Date(slots[0]!).getTime() - 24 * 60 * 60 * 1000)
  const voteExpiresAt = new Date(Math.min(byDeadline.getTime(), beforeFirstSlot.getTime())).toISOString()

  clubRepo.setCandidateSlots(club.id, slots, voteExpiresAt)
  clubRepo.updateStatus(club.id, 'scheduling')
  notificationRepo.insertMany(
    ids,
    'club_vote_request',
    `『${club.bookTitle}』 책모임 시간을 골라주세요`,
    `후보 ${slots.length}개 중 가능한 시간을 모두 골라주세요. ${formatKst(voteExpiresAt)}에 마감돼요.`,
    `/clubs/${club.id}`
  )
}

/** 득표 집계 → 최다 득표, 동점·무투표면 가장 이른 슬롯(candidate_slots는 시간순). */
function pickSlot(club: Club): string {
  const counts = club.candidateSlots.map((_, i) => club.votes.filter((v) => v.slotIdx === i).length)
  let best = 0
  for (let i = 1; i < counts.length; i += 1) if (counts[i]! > counts[best]!) best = i
  return club.candidateSlots[best]!
}

function confirmClub(club: Club): void {
  const meetAt = pickSlot(club)
  clubRepo.confirm(club.id, meetAt)
  const where = club.place ? ` · ${club.place.name}` : ''
  notificationRepo.insertMany(
    acceptedMembers(club).map((m) => m.userId),
    'club_confirmed',
    `『${club.bookTitle}』 책모임 시간이 정해졌어요`,
    `${formatKst(meetAt)}${where}`,
    `/clubs/${club.id}`
  )
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
  respond(clubId: number, userId: number, accept: boolean, now: Date = new Date()): Club {
    const club = requireClub(clubId)
    if (club.status !== 'inviting') throw new ApiError(400, '지금은 응답할 수 있는 상태가 아니에요')

    const me = club.members.find((m) => m.userId === userId)
    if (!me) throw new ApiError(403, '초대받은 모임이 아니에요')
    if (me.inviteStatus !== 'invited') throw new ApiError(400, '이미 응답했어요')

    clubRepo.setInviteStatus(club.id, userId, accept ? 'accepted' : 'declined')
    const updated = requireClub(clubId)

    if (stillPossible(updated) < CLUB_RULES.minMembers) {
      cancelForLackOfMembers(
        updated,
        acceptedMembers(updated).map((m) => m.userId),
        `정원(${CLUB_RULES.minMembers}명)을 채우지 못했어요`
      )
      return requireClub(clubId)
    }

    if (acceptedMembers(updated).length >= CLUB_RULES.minMembers) {
      enterScheduling(updated, now)
      return requireClub(clubId)
    }

    return updated
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
      // 수락이 정원을 채우는 순간 respond가 스스로 scheduling으로 넘기므로,
      // 기한이 지난 inviting 모임은 항상 정원 미달이다 — 취소만 한다.
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

  /** 시간 투표 — 수락자만, scheduling에서만. 전원이 투표했으면 즉시 확정한다. */
  vote(clubId: number, userId: number, slotIdxs: number[]): Club {
    const club = requireClub(clubId)
    if (club.status !== 'scheduling') throw new ApiError(400, '지금은 투표할 수 있는 상태가 아니에요')
    if (club.voteExpiresAt && club.voteExpiresAt <= new Date().toISOString()) throw new ApiError(400, '투표가 마감됐어요')
    const me = club.members.find((m) => m.userId === userId)
    if (!me || me.inviteStatus !== 'accepted') throw new ApiError(403, '참여를 수락한 사람만 투표할 수 있어요')
    if (slotIdxs.length === 0) throw new ApiError(400, '가능한 시간을 하나 이상 골라주세요')
    const valid = slotIdxs.filter((i) => Number.isInteger(i) && i >= 0 && i < club.candidateSlots.length)
    if (valid.length !== slotIdxs.length) throw new ApiError(400, '없는 시간 후보예요')

    clubRepo.castVotes(club.id, userId, valid)
    const updated = requireClub(clubId)

    const voters = new Set(updated.votes.map((v) => v.userId))
    const everyoneVoted = acceptedMembers(updated).every((m) => voters.has(m.userId))
    if (everyoneVoted) confirmClub(updated)
    return requireClub(clubId)
  },

  /** 투표 마감이 지난 모임을 확정한다. 처리 건수 반환. */
  closeVotes(now: Date): number {
    const nowIso = now.toISOString()
    let closed = 0
    for (const club of clubRepo.listByStatus('scheduling')) {
      if (!club.voteExpiresAt || club.voteExpiresAt > nowIso) continue
      confirmClub(club)
      closed += 1
    }
    return closed
  },

  /**
   * 모임 전날(KST 달력 기준)이면 수락자에게 리마인드(중복 방지). 보낸 사람 수 반환.
   * 주기 작업이 매일 09:00 KST에 한 번 돌아 "내일" 열리는 모임을 찾는다 — 24시간 창이 아니다.
   */
  remindTomorrow(now: Date): number {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    let sent = 0
    for (const club of clubRepo.listByStatus('confirmed')) {
      if (!club.meetAt) continue
      const meetAt = new Date(club.meetAt)
      if (meetAt <= now || !sameKstDate(meetAt, tomorrow)) continue
      const link = `/clubs/${club.id}`
      const targets = acceptedMembers(club).filter((m) => !notificationRepo.has(m.userId, 'club_reminder', link))
      if (targets.length === 0) continue
      const where = club.place ? ` · ${club.place.name}` : ''
      notificationRepo.insertMany(
        targets.map((m) => m.userId),
        'club_reminder',
        `내일 『${club.bookTitle}』 책모임이 있어요`,
        `${formatKst(club.meetAt)}${where}`,
        link
      )
      sent += targets.length
    }
    return sent
  },

  /** 모임 시각이 지난 confirmed 모임을 done으로. done_at = 모임 시각. 처리 건수 반환. */
  finishPast(now: Date): number {
    const nowIso = now.toISOString()
    let finished = 0
    for (const club of clubRepo.listByStatus('confirmed')) {
      if (!club.meetAt || club.meetAt > nowIso) continue
      clubRepo.markDone(club.id, club.meetAt)
      finished += 1
    }
    return finished
  },
}
