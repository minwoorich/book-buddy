import { clubMessageRepo } from '../repositories/clubMessageRepo'
import { clubRepo } from '../repositories/clubRepo'
import { notificationRepo } from '../repositories/notificationRepo'
import { clubStream } from '../utils/clubStream'
import { ApiError } from '../utils/errors'
import { kstParts } from '../../shared/utils/clubTime'
import { clubTitle } from '../../shared/utils/clubTitle'
import type { Club, ClubMessage } from '../../shared/types'

export const CHAT_BODY_MAX = 500
const PAGE_DEFAULT = 50
const PAGE_MAX = 100

function requireClub(clubId: number): Club {
  const club = clubRepo.findById(clubId)
  if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')
  return club
}

/** 채팅은 수락한 참가자만 — 초대만 받은 사람은 참여 뒤에 볼 수 있다. */
function requireParticipant(club: Club, userId: number): void {
  const me = club.members.find((m) => m.userId === userId)
  if (!me || me.inviteStatus !== 'accepted') throw new ApiError(403, '참여하면 이야기를 볼 수 있어요')
}

/** KST 달력 날짜 — 알림 dedup 키. */
function kstDateKey(now: Date): string {
  const p = kstParts(now)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export const clubChatService = {
  list(clubId: number, userId: number, opts: { before?: number | null; limit?: number }): ClubMessage[] {
    const club = requireClub(clubId)
    requireParticipant(club, userId)
    const limit = Math.min(Math.max(opts.limit ?? PAGE_DEFAULT, 1), PAGE_MAX)
    return clubMessageRepo.listBefore(clubId, opts.before ?? null, limit)
  },

  /**
   * 보내기 — 저장 → 구독자에게 발행 → 알림. 알림은 메시지마다가 아니라 모임당 KST 하루 1건이고,
   * 작성자와 지금 스트림에 붙어 있는 사람(이미 보고 있다)은 뺀다.
   */
  send(clubId: number, userId: number, body: string, now: Date = new Date()): ClubMessage {
    const club = requireClub(clubId)
    requireParticipant(club, userId)
    if (club.status === 'done' || club.status === 'canceled') throw new ApiError(400, '끝난 모임이에요. 읽을 수만 있어요.')
    const text = body?.trim() ?? ''
    if (text.length === 0 || text.length > CHAT_BODY_MAX) throw new ApiError(400, `메시지는 1~${CHAT_BODY_MAX}자예요`)

    const message = clubMessageRepo.insert(clubId, userId, 'chat', text)
    clubStream.publish(clubId, message)

    const link = `/clubs/${club.id}?chat=${kstDateKey(now)}`
    const online = clubStream.onlineUserIds(clubId)
    const targets = club.members
      .filter((m) => m.inviteStatus === 'accepted' && m.userId !== userId && !online.has(m.userId) && !notificationRepo.has(m.userId, 'club_chat', link))
      .map((m) => m.userId)
    notificationRepo.insertMany(targets, 'club_chat', `${clubTitle(club)}에 새 이야기가 있어요`, text.slice(0, 80), link)
    return message
  },

  markRead(clubId: number, userId: number, lastReadId: number): void {
    const club = requireClub(clubId)
    requireParticipant(club, userId)
    if (!Number.isInteger(lastReadId) || lastReadId < 0) throw new ApiError(400, '잘못된 메시지 번호예요')
    clubMessageRepo.markRead(clubId, userId, lastReadId)
  },

  /** 시스템 메시지(참여·후보 변경·확정 안내) — 서버 내부용, 알림 없음. */
  postSystem(clubId: number, body: string): ClubMessage {
    const message = clubMessageRepo.insert(clubId, null, 'system', body)
    clubStream.publish(clubId, message)
    return message
  },
}
