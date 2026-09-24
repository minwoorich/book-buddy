import { clubRepo } from '../../repositories/clubRepo'
import { handleApi, requireUser } from '../../utils/api'

/** 모집 중인 사람 모임 — 목록의 "모집 중" 구획. 정적 라우트라 [id]보다 먼저 잡힌다. */
export default defineEventHandler(
  handleApi((event) => {
    requireUser(event)
    return clubRepo.listRecruiting(new Date().toISOString())
  })
)
