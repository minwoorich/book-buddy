import { reviewRepo } from '../../../repositories/reviewRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 리뷰 삭제(QA #16). 본인 또는 관리자만 가능하다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    const review = reviewRepo.findById(id)
    if (!review) throw new ApiError(404, '없는 리뷰예요')
    if (review.userId !== me.id && me.role !== 'admin') {
      throw new ApiError(403, '내가 쓴 리뷰만 삭제할 수 있어요')
    }

    reviewRepo.remove(id)
    setResponseStatus(event, 204)
    return null
  })
)
