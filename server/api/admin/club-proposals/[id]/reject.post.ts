import { clubService } from '../../../../services/clubService'
import { handleApi, requireAdmin } from '../../../../utils/api'
import { ApiError } from '../../../../utils/errors'

/** 제안 거절 — 아무에게도 알리지 않고 조용히 취소한다. */
export default defineEventHandler(
  handleApi((event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isFinite(id)) throw new ApiError(400, '잘못된 모임 번호예요')
    clubService.rejectProposal(id)
    return { ok: true as const }
  })
)
