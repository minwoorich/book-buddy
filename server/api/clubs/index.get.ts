import { clubRepo } from '../../repositories/clubRepo'
import { groupClubsForUser } from '../../utils/clubView'
import { handleApi, requireUser } from '../../utils/api'

/** 내 책모임 — 초대/응답필요/참여중/지난 네 묶음. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    return groupClubsForUser(clubRepo.listForUser(me.id), me.id)
  })
)
