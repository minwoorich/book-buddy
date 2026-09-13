import { bookRepo } from '../../../repositories/bookRepo'
import { reviewRepo } from '../../../repositories/reviewRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const bookId = Number(getRouterParam(event, 'id'))
    const { rating, content } = await readBody<{ rating: number; content: string }>(event)
    if (!rating || rating < 1 || rating > 5 || !content?.trim()) {
      throw new ApiError(400, '별점(1~5)과 한줄 리뷰를 입력해주세요')
    }
    if (!bookRepo.findById(bookId)) throw new ApiError(404, '없는 책이에요')

    const review = reviewRepo.insert(bookId, me.id, rating, content.trim())
    setResponseStatus(event, 201)
    return review
  })
)
