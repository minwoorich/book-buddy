import { memberRepo } from '../../../repositories/memberRepo'
import { userRepo } from '../../../repositories/userRepo'
import { handleApi, requireAdmin } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 관리자 회원 상세 — 사람 정보 + 대출·반납 이력 전체 + 남긴 리뷰. */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    const user = userRepo.findById(id)
    if (!user) throw new ApiError(404, '없는 회원이에요')
    return {
      user,
      loans: memberRepo.loansOf(id),
      reviews: memberRepo.reviewsOf(id),
    }
  })
)
