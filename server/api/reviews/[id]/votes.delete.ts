import { reviewVoteRepo } from '../../../repositories/reviewVoteRepo'
import { handleApi, requireUser } from '../../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const reviewId = Number(getRouterParam(event, 'id'))
    reviewVoteRepo.remove(reviewId, me.id)
    return { ok: true }
  })
)
