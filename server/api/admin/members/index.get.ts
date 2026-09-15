import { memberRepo } from '../../../repositories/memberRepo'
import { handleApi, requireAdmin } from '../../../utils/api'

/** 관리자 회원 목록 — 사람별 대출중·연체·완독·리뷰 집계와 마지막 활동 시각. */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    return memberRepo.summaries()
  })
)
