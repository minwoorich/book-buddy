import { clubRepo } from '../../../repositories/clubRepo'
import { clubMessageRepo } from '../../../repositories/clubMessageRepo'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'
import { canViewClub } from '../../../utils/clubView'

/**
 * 모임 상세. 멤버·관리자만 볼 수 있다 — 남의 모임 아젠다에는 동료 리뷰 인용이 들어 있다.
 * 예외: 모집 중이거나 확정된 사람 모임은 누구나(자리가 있으면 들어올 수 있게).
 */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')

    const club = clubRepo.findById(id)
    if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')

    if (!canViewClub(club, me)) throw new ApiError(403, '참여 중인 모임만 볼 수 있어요')

    return { ...club, unreadMessages: clubMessageRepo.unreadCounts(me.id, [club.id]).get(club.id) ?? 0 }
  })
)
