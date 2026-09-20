import { clubRepo } from '../../../repositories/clubRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 모임 상세. 멤버만 볼 수 있다 — 남의 모임 아젠다에는 동료 리뷰 인용이 들어 있다. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isFinite(id)) throw new ApiError(400, '잘못된 모임 번호예요')

    const club = clubRepo.findById(id)
    if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')

    const isMember = club.members.some((m) => m.userId === me.id)
    if (!isMember && me.role !== 'admin') throw new ApiError(403, '참여 중인 모임만 볼 수 있어요')

    return club
  })
)
