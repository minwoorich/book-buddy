import { clubPostRepo } from '../repositories/clubPostRepo'
import { clubRepo } from '../repositories/clubRepo'
import { notificationRepo } from '../repositories/notificationRepo'
import { ApiError } from '../utils/errors'
import { kstParts } from '../../shared/utils/clubTime'
import { clubTitle } from '../../shared/utils/clubTitle'
import type { Club, ClubPost } from '../../shared/types'

const BODY_MAX = 2000

function requireClub(clubId: number): Club {
  const club = clubRepo.findById(clubId)
  if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')
  return club
}

/** 게시판은 수락한 참가자만 — 초대만 받은 사람은 참여 뒤에 볼 수 있다. */
function requireParticipant(club: Club, userId: number): void {
  const me = club.members.find((m) => m.userId === userId)
  if (!me || me.inviteStatus !== 'accepted') throw new ApiError(403, '참여하면 이야기를 볼 수 있어요')
}

/** KST 달력 날짜 문자열 — 알림 dedup 키에 들어간다. */
function kstDateKey(now: Date): string {
  const p = kstParts(now)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export const clubPostService = {
  list(clubId: number, userId: number): ClubPost[] {
    const club = requireClub(clubId)
    requireParticipant(club, userId)
    return clubPostRepo.listByClub(clubId)
  },

  /** 글 또는 댓글(한 단계). 새 글은 작성자를 뺀 참가자에게 모임당 KST 하루 1건만 알린다. */
  create(clubId: number, userId: number, input: { body: string; parentId?: number | null }, now: Date = new Date()): ClubPost {
    const club = requireClub(clubId)
    requireParticipant(club, userId)
    if (club.status === 'done' || club.status === 'canceled') throw new ApiError(400, '끝난 모임이에요. 읽을 수만 있어요.')

    const body = input.body?.trim() ?? ''
    if (body.length === 0 || body.length > BODY_MAX) throw new ApiError(400, `내용은 1~${BODY_MAX}자예요`)

    const parentId = input.parentId ?? null
    if (parentId !== null) {
      const parent = clubPostRepo.findById(parentId)
      if (!parent || parent.clubId !== clubId) throw new ApiError(400, '댓글을 달 글을 찾을 수 없어요')
      if (parent.parentId !== null) throw new ApiError(400, '댓글에는 댓글을 달 수 없어요')
    }

    const post = clubPostRepo.insert(clubId, userId, parentId, body)

    if (parentId === null) {
      const link = `/clubs/${club.id}?posts=${kstDateKey(now)}`
      const targets = club.members
        .filter((m) => m.inviteStatus === 'accepted' && m.userId !== userId && !notificationRepo.has(m.userId, 'club_post', link))
        .map((m) => m.userId)
      notificationRepo.insertMany(targets, 'club_post', `${clubTitle(club)}에 새 글이 올라왔어요`, body.slice(0, 80), link)
    }
    return post
  },

  /** 작성자 또는 호스트. 글을 지우면 댓글도 같이. */
  remove(clubId: number, userId: number, postId: number): void {
    const club = requireClub(clubId)
    requireParticipant(club, userId)
    const post = clubPostRepo.findById(postId)
    if (!post || post.clubId !== clubId) throw new ApiError(404, '글을 찾을 수 없어요')
    const me = club.members.find((m) => m.userId === userId)!
    if (post.userId !== userId && me.role !== 'host') throw new ApiError(403, '작성자나 개설자만 지울 수 있어요')
    clubPostRepo.remove(postId)
  },
}
