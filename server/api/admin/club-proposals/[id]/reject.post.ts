import { clubService } from '../../../../services/clubService'
import { handleApi, requireAdmin, requireIdParam } from '../../../../utils/api'

/** 제안 거절 — 아무에게도 알리지 않고 조용히 취소한다. */
export default defineEventHandler(
  handleApi((event) => {
    requireAdmin(event)
    const id = requireIdParam(event, '모임 번호')
    clubService.rejectProposal(id)
    return { ok: true as const }
  })
)
