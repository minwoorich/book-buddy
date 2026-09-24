import { bookRepo } from '../repositories/bookRepo'
import { clubRepo } from '../repositories/clubRepo'
import { notificationRepo } from '../repositories/notificationRepo'
import { userRepo } from '../repositories/userRepo'
import { clubService } from './clubService'
import { ApiError } from '../utils/errors'
import { clubTitle } from '../../shared/utils/clubTitle'
import type { Club, ClubMember } from '../../shared/types'

/** 직접 개설의 입력 한계. 설계서 §5.1. */
export const RECRUIT_RULES = {
  capacityMin: 3,
  capacityMax: 6,
  recruitDays: [3, 7, 14] as readonly number[],
  titleMax: 40,
  descriptionMax: 1000,
} as const

export interface CreateClubInput {
  bookId: number
  title: string
  description: string
  capacity: number
  recruitDays: number
}

function requireClub(clubId: number): Club {
  const club = clubRepo.findById(clubId)
  if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')
  return club
}

function requireUserClub(clubId: number): Club {
  const club = requireClub(clubId)
  if (club.origin !== 'user') throw new ApiError(400, '사람이 직접 연 모임에서만 할 수 있어요')
  return club
}

function requireHost(club: Club, userId: number): void {
  const me = club.members.find((m) => m.userId === userId)
  if (!me || me.role !== 'host') throw new ApiError(403, '개설자만 할 수 있어요')
}

function requireRecruiting(club: Club): void {
  if (club.status !== 'inviting') throw new ApiError(400, '모집 중인 모임이 아니에요')
}

function accepted(club: Club): ClubMember[] {
  return club.members.filter((m) => m.inviteStatus === 'accepted')
}

/** 그날의 끝(23:59:59Z) — 매처·기한 작업이 도는 00:00Z와 겹치지 않게 하는 관례(1단계). */
function endOfDayUtc(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(23, 59, 59, 0)
  return d
}

/** 취소 공통 — 상태를 바꾸고 수락자·아직 응답 없는 초대자에게 알린다(거절자·호스트 자신 제외). */
function cancelAndNotify(club: Club, reason: string, body: string, excludeUserId: number | null): Club {
  clubRepo.updateStatus(club.id, 'canceled', { canceledReason: reason })
  const targets = club.members
    .filter((m) => m.inviteStatus !== 'declined' && m.userId !== excludeUserId)
    .map((m) => m.userId)
  notificationRepo.insertMany(targets, 'club_canceled', `${clubTitle(club)}이 열리지 않았어요`, body, '/clubs')
  return requireClub(club.id)
}

export const clubRecruitService = {
  /** 개설 — 검증, 개설 상한(모집 중 1개), 즉시 모집 중. 알림은 없다(개설자뿐이라). */
  create(userId: number, input: CreateClubInput, now: Date = new Date()): Club {
    const title = input.title?.trim() ?? ''
    const description = input.description?.trim() ?? ''
    if (title.length === 0 || title.length > RECRUIT_RULES.titleMax) throw new ApiError(400, `제목은 1~${RECRUIT_RULES.titleMax}자예요`)
    if (description.length > RECRUIT_RULES.descriptionMax) throw new ApiError(400, `소개글은 ${RECRUIT_RULES.descriptionMax}자까지예요`)
    if (!Number.isInteger(input.capacity) || input.capacity < RECRUIT_RULES.capacityMin || input.capacity > RECRUIT_RULES.capacityMax) {
      throw new ApiError(400, `정원은 ${RECRUIT_RULES.capacityMin}~${RECRUIT_RULES.capacityMax}명이에요`)
    }
    if (!RECRUIT_RULES.recruitDays.includes(input.recruitDays)) throw new ApiError(400, '모집 기간은 3·7·14일 중 하나예요')
    if (!bookRepo.findById(input.bookId)) throw new ApiError(400, '책을 찾을 수 없어요')
    if (clubRepo.hostingRecruitingCount(userId) > 0) throw new ApiError(400, '모집 중인 모임은 하나만 열 수 있어요')

    const recruitUntilIso = endOfDayUtc(new Date(now.getTime() + input.recruitDays * 24 * 60 * 60 * 1000)).toISOString()
    return clubRepo.createUserClub({ bookId: input.bookId, createdBy: userId, title, description, capacity: input.capacity, recruitUntilIso })
  },

  /** 공개 참여(선착순). 초대받은 사람이 누르면 수락, 거절했던 사람은 다시 들어온다. */
  join(clubId: number, userId: number, now: Date = new Date()): Club {
    const club = requireUserClub(clubId)
    requireRecruiting(club)
    const me = club.members.find((m) => m.userId === userId)
    if (me?.inviteStatus === 'accepted') throw new ApiError(400, '이미 참여 중이에요')
    if (me?.inviteStatus === 'invited') return clubService.respond(clubId, userId, true, now)
    if (accepted(club).length + club.members.filter((m) => m.inviteStatus === 'invited').length >= club.capacity) {
      throw new ApiError(400, '정원이 찼어요')
    }

    clubRepo.upsertMember(club.id, userId, 'member', 'accepted')
    const updated = requireClub(clubId)
    const host = updated.members.find((m) => m.role === 'host')
    const who = userRepo.findById(userId)
    if (host && who) {
      notificationRepo.insertMany(
        [host.userId],
        'club_joined',
        `${who.name}님이 ${clubTitle(updated)}에 참여했어요 (${accepted(updated).length}/${updated.capacity})`,
        '',
        `/clubs/${updated.id}`
      )
    }
    return updated
  },

  /** 참여 취소 — 모집 중에만, 개설자는 접기를 써야 한다. 행을 지우므로 다시 참여할 수 있다. */
  leave(clubId: number, userId: number): Club {
    const club = requireUserClub(clubId)
    requireRecruiting(club)
    const me = club.members.find((m) => m.userId === userId)
    if (!me || me.inviteStatus !== 'accepted') throw new ApiError(400, '참여 중인 모임이 아니에요')
    if (me.role === 'host') throw new ApiError(400, '개설자는 참여를 취소할 수 없어요. 모임을 접어주세요.')

    clubRepo.removeMember(club.id, userId)
    const updated = requireClub(clubId)
    const host = updated.members.find((m) => m.role === 'host')
    if (host) {
      notificationRepo.insertMany(
        [host.userId],
        'club_left',
        `${me.userName}님이 참여를 취소했어요 (${accepted(updated).length}/${updated.capacity})`,
        '',
        `/clubs/${updated.id}`
      )
    }
    return updated
  },

  /** 초대 — 호스트만. 이미 멤버인 사람은 건너뛰고, 초대 수 + 수락 수가 정원을 넘으면 400. */
  invite(clubId: number, userId: number, userIds: number[]): Club {
    const club = requireUserClub(clubId)
    requireHost(club, userId)
    requireRecruiting(club)
    const existing = new Set(club.members.filter((m) => m.inviteStatus !== 'declined').map((m) => m.userId))
    const targets = [...new Set(userIds)].filter((id) => !existing.has(id))
    if (targets.length === 0) throw new ApiError(400, '초대할 사람이 없어요')
    for (const id of targets) if (!userRepo.findById(id)) throw new ApiError(400, '없는 사용자가 있어요')

    const pending = club.members.filter((m) => m.inviteStatus === 'invited').length
    if (accepted(club).length + pending + targets.length > club.capacity) throw new ApiError(400, '정원보다 많이 초대할 수 없어요')

    for (const id of targets) clubRepo.upsertMember(club.id, id, 'member', 'invited')
    const host = club.members.find((m) => m.role === 'host')!
    notificationRepo.insertMany(
      targets,
      'club_invited',
      `${host.userName}님이 ${clubTitle(club)}에 초대했어요`,
      club.description.length > 0 ? club.description.slice(0, 80) : '참여 여부를 알려주세요.',
      `/clubs/${club.id}`
    )
    return requireClub(clubId)
  },

  /** 접기 — 호스트만, 모집 중에만. */
  withdraw(clubId: number, userId: number): Club {
    const club = requireUserClub(clubId)
    requireHost(club, userId)
    requireRecruiting(club)
    return cancelAndNotify(club, '개설자가 모임을 접었어요', '개설자가 모임을 접었어요. 다음에 다시 만나요.', userId)
  },

  /** 관리자 닫기 — 끝나지 않은 모임이면 origin을 가리지 않는다. */
  adminCancel(clubId: number): Club {
    const club = requireClub(clubId)
    if (club.status === 'done' || club.status === 'canceled') throw new ApiError(400, '이미 끝난 모임이에요')
    return cancelAndNotify(club, '관리자가 모임을 닫았어요', '관리자가 모임을 닫았어요.', null)
  },
}
