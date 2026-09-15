import { reviewRepo } from '../../repositories/reviewRepo'
import { handleApi, requireUser } from '../../utils/api'

/** 내가 남긴 리뷰 목록(최신순, 책 제목·표지 포함) — 내 서재 섹션용(QA #25). */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    return reviewRepo.listByUser(me.id)
  })
)
