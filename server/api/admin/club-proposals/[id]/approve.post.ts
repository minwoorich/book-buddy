import { clubService } from '../../../../services/clubService'
import { handleApi, requireAdmin, requireIdParam } from '../../../../utils/api'

/** 제안 승인 — 이 시점에 초대 알림이 나간다. */
export default defineEventHandler(
  handleApi((event) => {
    requireAdmin(event)
    const id = requireIdParam(event, '모임 번호')
    return clubService.approveProposal(id)
  })
)
