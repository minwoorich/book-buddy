import { clubRepo } from '../../../repositories/clubRepo'
import { handleApi, requireAdmin } from '../../../utils/api'

/** 관리자 — 진행 중인 모임 전부(모집 중·조율 중·확정). */
export default defineEventHandler(
  handleApi((event) => {
    requireAdmin(event)
    return clubRepo.listActive()
  })
)
