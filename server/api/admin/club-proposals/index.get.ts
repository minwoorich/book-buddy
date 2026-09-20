import { clubRepo } from '../../../repositories/clubRepo'
import { handleApi, requireAdmin } from '../../../utils/api'

/** 승인 대기 중인 제안 목록. 점수 높은 순. */
export default defineEventHandler(
  handleApi((event) => {
    requireAdmin(event)
    return clubRepo.listByStatus('proposed').sort((a, b) => b.matchScore - a.matchScore)
  })
)
