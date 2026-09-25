import { clubRepo } from '../../repositories/clubRepo'
import { clubMessageRepo } from '../../repositories/clubMessageRepo'
import { handleApi, requireUser } from '../../utils/api'
import { hasSeat, joinWindowOpen } from '../../../shared/utils/clubOpen'

/** 열려 있는 사람 모임 — 모집 중이거나 확정됐지만 아직 자리가 있는 것. 정적 라우트라 [id]보다 먼저 잡힌다. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const now = new Date()
    const clubs = clubRepo.listOpen(now.toISOString()).filter((c) => joinWindowOpen(c, now) && hasSeat(c))
    const unread = clubMessageRepo.unreadCounts(me.id, clubs.map((c) => c.id))
    return clubs.map((c) => ({ ...c, unreadMessages: unread.get(c.id) ?? 0 }))
  })
)
