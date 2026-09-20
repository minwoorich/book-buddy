import { clubService } from '../../../../services/clubService'
import { handleApi, requireAdmin } from '../../../../utils/api'
import { ApiError } from '../../../../utils/errors'

/** 제안 승인 — 이 시점에 초대 알림이 나간다. */
export default defineEventHandler(
  handleApi((event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isFinite(id)) throw new ApiError(400, '잘못된 모임 번호예요')
    return clubService.approveProposal(id)
  })
)
