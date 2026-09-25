import { clubRepo } from '../repositories/clubRepo'
import { notificationRepo } from '../repositories/notificationRepo'
import { placeReviewRepo } from '../repositories/placeReviewRepo'
import { kakaoLocalService } from './kakaoLocalService'
import { CLUB_RULES } from '../utils/clubRules'
import { ApiError } from '../utils/errors'
import { generateCandidateSlots, kstParts } from '../utils/clubSlots'
import { describeMeetingPlace, scoreMeetingPlace } from '../utils/clubPlace'
import { pickByVotes } from '../utils/clubCandidates'
import { formatKst, formatKstDate, placeLocked } from '../../shared/utils/clubTime'
import { clubTitle, josa } from '../../shared/utils/clubTitle'
import { midpointOf, officeForCompany } from '../../shared/constants/company'
import type { Club, ClubMember, DeadlineRunResult, Place, PlaceCandidate, PlaceCandidatesResult } from '../../shared/types'

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
    const t = clubTitle(club)
    notificationRepo.insertMany(
      clubRepo.adminUserIds(),
      'club_no_slots',
      `${t}${josa(t, '이', '가')} 시간을 찾지 못해 취소됐어요`,
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
    `${clubTitle(club)} 시간을 골라주세요`,
    `후보 ${slots.length}개 중 가능한 시간을 모두 골라주세요. ${formatKstDate(new Date(new Date(voteExpiresAt).getTime() + 1000).toISOString())} 아침 9시에 마감돼요.`,
    `/clubs/${club.id}`
  )
}

/**
 * 득표 집계 → 최다 득표, 동점·무투표면 가장 이른 슬롯(candidate_slots는 시간순).
 * 이미 지난 슬롯은 후보에서 뺀다 — 마감 처리(주기 작업·수동 실행)가 며칠 늦게 돌 수도 있으므로,
 * 그사이 지나버린 시간을 "확정"으로 내보내면 안 된다. 남은 미래 슬롯이 없으면 null.
 */
function pickSlot(club: Club, now: Date): string | null {
  return pickByVotes(club.candidateSlots, club.votes, now)
}

function confirmClub(club: Club, now: Date): void {
  const meetAt = pickSlot(club, now)
  if (meetAt === null) {
    clubRepo.updateStatus(club.id, 'canceled', { canceledReason: '투표가 끝나기 전에 후보 시간이 모두 지났어요' })
    const t = clubTitle(club)
    notificationRepo.insertMany(
      acceptedMembers(club).map((m) => m.userId),
      'club_canceled',
      `${t}${josa(t, '이', '가')} 열리지 못했어요`,
      '후보 시간이 모두 지나 시간을 정하지 못했어요. 다음 기회에 다시 제안드릴게요.',
      '/clubs'
    )
    return
  }
  clubRepo.confirm(club.id, meetAt)
  const where = placeSuffix(club)
  notificationRepo.insertMany(
    acceptedMembers(club).map((m) => m.userId),
    'club_confirmed',
    `${clubTitle(club)} 시간이 정해졌어요`,
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
  const t = clubTitle(club)
  notificationRepo.insertMany(
    recipientIds,
    'club_canceled',
    `${t}${josa(t, '이', '가')} 열리지 않았어요`,
    '이번에는 인원이 모이지 않았어요. 다음 기회에 다시 제안드릴게요.',
    '/clubs'
  )
}

/** 알림 본문 뒤에 붙는 " · 장소" — 확정·리마인드·장소 확정 세 곳이 같은 꼴을 쓴다. */
function placeSuffix(club: Club): string {
  return club.place ? ` · ${club.place.name}` : ''
}

export interface ClubPlaceInput {
  kakaoId: string
  name: string
  lat: number
  lng: number
}

type SearchFn = typeof kakaoLocalService.search

export const clubService = {
  /** 조율중 진입 — 모집을 닫는 사람 모임(clubRecruitService)이 같은 절차를 타도록 노출한다. */
  enterScheduling(club: Club, now: Date): void {
    enterScheduling(club, now)
  },

  /** 관리자 승인 — 여기서 처음으로 사람에게 초대가 나간다. */
  approveProposal(clubId: number): Club {
    const club = requireClub(clubId)
    if (club.status !== 'proposed') throw new ApiError(400, '이미 처리된 제안이에요')

    clubRepo.updateStatus(club.id, 'inviting')
    notificationRepo.insertMany(
      club.members.map((m) => m.userId),
      'club_invited',
      `${clubTitle(club)}에 초대됐어요`,
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

  /**
   * 초대 수락/거절. 정원이 차면 조율중으로, 성립 불가가 확정되면 취소로 넘어간다 —
   * 단 이 자동 전이는 에이전트 모임에만 해당한다. 사람 모임(origin === 'user')은 개설자가
   * 모집을 닫아야 조율중으로 넘어가므로(clubRecruitService), 응답만 기록하고 전이는 하지 않는다.
   */
  respond(clubId: number, userId: number, accept: boolean, now: Date = new Date()): Club {
    const club = requireClub(clubId)
    if (club.status !== 'inviting') throw new ApiError(400, '지금은 응답할 수 있는 상태가 아니에요')

    const me = club.members.find((m) => m.userId === userId)
    if (!me) throw new ApiError(403, '초대받은 모임이 아니에요')
    if (me.inviteStatus !== 'invited') throw new ApiError(400, '이미 응답했어요')

    clubRepo.setInviteStatus(club.id, userId, accept ? 'accepted' : 'declined')
    const updated = requireClub(clubId)

    // 사람 모임은 개설자가 모집을 닫는다(clubRecruitService) — 응답만 기록하고 전이는 하지 않는다.
    // 공개 참여가 있으니 "3명이 불가능하다"는 판정도 없다.
    if (updated.origin === 'user') return updated

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
      if (club.origin !== 'agent') continue
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
      if (club.origin !== 'agent') continue
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
        `${clubTitle(club)} 응답이 내일 마감돼요`,
        '참여 여부를 알려주시면 모임을 확정할 수 있어요.',
        link
      )
      sent += targets.length
    }

    return sent
  },

  /** 시간 투표 — 수락자만, scheduling에서만. 전원이 투표했으면 즉시 확정한다. */
  vote(clubId: number, userId: number, slotIdxs: number[], now: Date = new Date()): Club {
    const club = requireClub(clubId)
    if (club.status !== 'scheduling') throw new ApiError(400, '지금은 투표할 수 있는 상태가 아니에요')
    if (club.voteExpiresAt && club.voteExpiresAt <= now.toISOString()) throw new ApiError(400, '투표가 마감됐어요')
    const me = club.members.find((m) => m.userId === userId)
    if (!me || me.inviteStatus !== 'accepted') throw new ApiError(403, '참여를 수락한 사람만 투표할 수 있어요')
    if (slotIdxs.length === 0) throw new ApiError(400, '가능한 시간을 하나 이상 골라주세요')
    const valid = slotIdxs.filter((i) => Number.isInteger(i) && i >= 0 && i < club.candidateSlots.length)
    if (valid.length !== slotIdxs.length) throw new ApiError(400, '없는 시간 후보예요')

    clubRepo.castVotes(club.id, userId, valid)
    const updated = requireClub(clubId)

    const voters = new Set(updated.votes.map((v) => v.userId))
    const everyoneVoted = acceptedMembers(updated).every((m) => voters.has(m.userId))
    if (everyoneVoted) confirmClub(updated, now)
    return requireClub(clubId)
  },

  /** 투표 마감이 지난 모임을 확정한다. 처리 건수 반환. */
  closeVotes(now: Date): number {
    const nowIso = now.toISOString()
    let closed = 0
    for (const club of clubRepo.listByStatus('scheduling')) {
      if (!club.voteExpiresAt || club.voteExpiresAt > nowIso) continue
      confirmClub(club, now)
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
      const where = placeSuffix(club)
      const t = clubTitle(club)
      notificationRepo.insertMany(
        targets.map((m) => m.userId),
        'club_reminder',
        `내일 ${t}${josa(t, '이', '가')} 있어요`,
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

  /** 장소 확정 — 호스트만, scheduling·confirmed에서, 모임 당일 전까지. 바꿀 때마다 수락자에게 알린다. */
  setPlace(clubId: number, userId: number, place: ClubPlaceInput, now: Date = new Date()): Club {
    const club = requireClub(clubId)
    const host = club.members.find((m) => m.role === 'host')
    if (!host || host.userId !== userId) throw new ApiError(403, '진행자만 장소를 정할 수 있어요')
    if (club.status !== 'scheduling' && club.status !== 'confirmed') throw new ApiError(400, '지금은 장소를 정할 수 있는 상태가 아니에요')
    if (placeLocked(club, now)) throw new ApiError(400, '모임 당일에는 장소를 바꿀 수 없어요')
    if (!place.kakaoId?.trim() || !place.name?.trim()) throw new ApiError(400, '장소 정보가 비어 있어요')
    if (
      !Number.isFinite(place.lat) ||
      !Number.isFinite(place.lng) ||
      place.lat < -90 ||
      place.lat > 90 ||
      place.lng < -180 ||
      place.lng > 180
    ) {
      throw new ApiError(400, '장소 좌표가 올바르지 않아요')
    }

    clubRepo.setPlace(club.id, { kakaoId: place.kakaoId.trim(), name: place.name.trim(), lat: place.lat, lng: place.lng }, now.toISOString())
    const updated = requireClub(clubId)
    const when = updated.meetAt ? `${formatKst(updated.meetAt)}` : '시간은 투표로 정해져요'
    notificationRepo.insertMany(
      acceptedMembers(updated).map((m) => m.userId),
      'club_place_set',
      `${clubTitle(updated)} 장소가 정해졌어요`,
      `${when}${placeSuffix(updated)}`,
      `/clubs/${updated.id}`
    )
    return updated
  },

  /**
   * 모임 장소 후보 — 수락자 사업장의 중간 지점 반경에서 카카오 검색 → 사내 후기 집계 →
   * 모임 전용 점수식(스펙 §5.3) → 상위 N. 멤버만 볼 수 있다(참가자 좌표가 드러난다).
   */
  async placeCandidates(
    clubId: number,
    userId: number,
    deps: { kakaoRestKey: string; search?: SearchFn }
  ): Promise<PlaceCandidatesResult> {
    const club = requireClub(clubId)
    if (!club.members.some((m) => m.userId === userId)) throw new ApiError(403, '참여 중인 모임만 볼 수 있어요')
    if (club.status !== 'scheduling' && club.status !== 'confirmed') throw new ApiError(400, '지금은 장소를 정할 수 있는 상태가 아니에요')
    if (!deps.kakaoRestKey) throw new ApiError(503, '장소 검색을 사용할 수 없어요')

    const accepted = acceptedMembers(club)
    const midpoint = midpointOf(accepted.map((m) => officeForCompany(m.company)))
    const search = deps.search ?? kakaoLocalService.search
    const lists = await Promise.all(
      CLUB_RULES.placeSearchQueries.map((q) => search(deps.kakaoRestKey, q, 5, midpoint, CLUB_RULES.placeSearchRadiusM))
    )

    const byId = new Map<string, Place>()
    for (const list of lists) for (const p of list) if (p.kakaoId && !byId.has(p.kakaoId)) byId.set(p.kakaoId, p)
    const places = [...byId.values()]
    const summaries = new Map(placeReviewRepo.summaryByIds(places.map((p) => p.kakaoId!), userId).map((s) => [s.kakaoPlaceId, s]))

    const candidates: PlaceCandidate[] = places.map((p) => {
      const s = summaries.get(p.kakaoId!)
      const input = { distanceM: p.distanceM, total: s?.total ?? 0, tagCounts: s?.tagCounts ?? {}, memberCount: accepted.length }
      return { ...p, score: scoreMeetingPlace(input).total, reason: describeMeetingPlace(input), reviewTotal: s?.total ?? 0 }
    })
    candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)))

    return { midpoint, memberCount: accepted.length, candidates: candidates.slice(0, CLUB_RULES.placeCandidates) }
  },

  /**
   * 사후 후기 요청(플라이휠) — 장소가 있던 모임이 끝난 다음 날(KST)부터
   * CLUB_RULES.reviewRequestWindowDays일 안, 그 장소에 아직 후기를 쓰지 않은 수락자에게 한 번.
   * 정확히 "그 하루"가 아니라 창(window)으로 판정한다 — croner는 놓친 실행을 따라잡지 않으므로
   * 등호 비교면 cron 한 번을 놓친 모임은 영구히 요청을 못 받는다. 이미 있는
   * notificationRepo.has(link) + placeReviewRepo.findMine 이중 dedup이 멱등성을 보장하므로
   * 창 안에서 매일 다시 돌아도 한 번만 나간다. 링크에 이름·좌표를 실어 장소 페이지가 시트를
   * 바로 열게 한다(카카오에 id 단건 조회가 없다). 보낸 사람 수를 돌려준다.
   */
  requestPlaceReviews(now: Date): number {
    const today = kstParts(now)
    const todayUtcDate = Date.UTC(today.y, today.m - 1, today.d)
    // 창(window) + 하루 여유만큼만 거슬러 올라가 스캔 범위를 줄인다.
    const sinceIso = new Date(now.getTime() - (CLUB_RULES.reviewRequestWindowDays + 1) * 24 * 60 * 60 * 1000).toISOString()
    let sent = 0
    for (const club of clubRepo.listDoneWithPlace(sinceIso)) {
      if (!club.doneAt || !club.place) continue
      const doneDate = kstParts(new Date(club.doneAt))
      const doneUtcDate = Date.UTC(doneDate.y, doneDate.m - 1, doneDate.d)
      const daysSinceDone = Math.round((todayUtcDate - doneUtcDate) / (24 * 60 * 60 * 1000))
      if (daysSinceDone < 1 || daysSinceDone > CLUB_RULES.reviewRequestWindowDays) continue

      const p = club.place
      const link = `/places?review=${encodeURIComponent(p.kakaoId)}&name=${encodeURIComponent(p.name)}&lat=${p.lat}&lng=${p.lng}`
      const targets = acceptedMembers(club).filter(
        (m) => !placeReviewRepo.findMine(p.kakaoId, m.userId) && !notificationRepo.has(m.userId, 'club_review_request', link)
      )
      if (targets.length === 0) continue
      notificationRepo.insertMany(
        targets.map((m) => m.userId),
        'club_review_request',
        `${p.name}, 모임하기 어땠나요?`,
        `『${club.bookTitle}』 모임 장소 후기를 남겨주세요. 다음 모임 장소를 고르는 데 쓰여요.`,
        link
      )
      sent += targets.length
    }
    return sent
  },

  /**
   * 기한 관련 작업을 정해진 순서로 한 번에 돌린다 — 주기 작업(club:deadlines)과
   * 관리자 "기한 작업 지금 실행"이 같은 순서를 쓰게 한다.
   * 순서가 중요하다: 만료·마감·종료를 먼저 정리하고 리마인드를 보낸다 —
   * 반대면 오늘 취소·종료될 모임에도 "내일" 알림이 나간다.
   */
  runDeadlines(now: Date): DeadlineRunResult {
    const handled = clubService.expireInvites(now)
    const closed = clubService.closeVotes(now)
    const finished = clubService.finishPast(now)
    const reminded = clubService.remindExpiringInvites(now)
    const remindedTomorrow = clubService.remindTomorrow(now)
    const reviewRequested = clubService.requestPlaceReviews(now)
    // recruitExpired(사람 모임 모집 기간 만료 처리)는 아직 이 태스크가 만들지 않는다 — 3단계 이후에 채운다.
    return { handled, closed, finished, reminded, remindedTomorrow, reviewRequested, recruitExpired: 0 }
  },
}
