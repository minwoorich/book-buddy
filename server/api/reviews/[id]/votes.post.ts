import { reviewRepo } from '../../../repositories/reviewRepo'
import { reviewVoteRepo } from '../../../repositories/reviewVoteRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const reviewId = Number(getRouterParam(event, 'id'))
    if (!reviewRepo.findById(reviewId)) throw new ApiError(404, '없는 리뷰예요')
    reviewVoteRepo.insert(reviewId, me.id)
    return { ok: true }
  })
)
