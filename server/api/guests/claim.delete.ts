import { guestRepo } from '../../repositories/guestRepo'
import { handleApi, requireUser } from '../../utils/api'

/** 게스트 본인의 선점 해제(로그아웃 시). 게스트가 아니면 아무 일도 하지 않는다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    if (me.isGuest) guestRepo.release(me.id)
    return { ok: true }
  })
)
