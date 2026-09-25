import { clubRepo } from '../../repositories/clubRepo'
import { clubMessageRepo } from '../../repositories/clubMessageRepo'
import { handleApi, requireUser } from '../../utils/api'
import { hasSeat, joinWindowOpen } from '../../../shared/utils/clubOpen'

/** 열려 있는 사람 모임 — 모집 중이거나 확정됐지만 아직 자리가 있는 것. 정적 라우트라 [id]보다 먼저 잡힌다. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const now = new Date()
    // "정원 미만"은 confirmed에만 적용한다 — 모집 중인 꽉 찬 모임도 목록에 남아 "정원 마감"을 보인다(설계서 §3.5·§6.1).
    const clubs = clubRepo.listOpen(now.toISOString()).filter((c) => joinWindowOpen(c, now) && (c.status !== 'confirmed' || hasSeat(c)))
    const unread = clubMessageRepo.unreadCounts(me.id, clubs.map((c) => c.id))
    return clubs.map((c) => ({ ...c, unreadMessages: unread.get(c.id) ?? 0 }))
  })
)
