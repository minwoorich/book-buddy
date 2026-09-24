import { clubRecruitService } from '../../../../services/clubRecruitService'
import { handleApi, requireAdmin, requireIdParam } from '../../../../utils/api'

/** 관리자 닫기 — 끝나지 않은 모임이면 사람·에이전트 가리지 않는다. */
export default defineEventHandler(
  handleApi((event) => {
    requireAdmin(event)
    return clubRecruitService.adminCancel(requireIdParam(event, '모임 번호'))
  })
)
