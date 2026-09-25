import { clubRepo } from '../../repositories/clubRepo'
import { clubMessageRepo } from '../../repositories/clubMessageRepo'
import { groupClubsForUser } from '../../utils/clubView'
import { handleApi, requireUser } from '../../utils/api'

/** 내 책모임 — 초대/응답필요/참여중/지난 네 묶음. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const mine = clubRepo.listForUser(me.id)
    const unread = clubMessageRepo.unreadCounts(me.id, mine.map((c) => c.id))
    return groupClubsForUser(mine.map((c) => ({ ...c, unreadMessages: unread.get(c.id) ?? 0 })), me.id)
  })
)
