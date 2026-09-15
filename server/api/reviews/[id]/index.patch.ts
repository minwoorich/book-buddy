import { reviewRepo } from '../../../repositories/reviewRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 내가 쓴 리뷰 수정(QA #16). 별점·내용만 바꿀 수 있고 본인만 가능하다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    const review = reviewRepo.findById(id)
    if (!review) throw new ApiError(404, '없는 리뷰예요')
    if (review.userId !== me.id) throw new ApiError(403, '내가 쓴 리뷰만 수정할 수 있어요')

    const { rating, content } = await readBody<{ rating?: number; content?: string }>(event)
    if (!rating || rating < 1 || rating > 5 || !content?.trim()) {
      throw new ApiError(400, '별점(1~5)과 한줄 리뷰를 입력해주세요')
    }

    reviewRepo.update(id, rating, content.trim())
    return reviewRepo.findById(id)
  })
)
