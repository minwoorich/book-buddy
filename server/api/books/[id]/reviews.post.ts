import { bookRepo } from '../../../repositories/bookRepo'
import { loanRepo } from '../../../repositories/loanRepo'
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

    // 읽은(대출한) 기록이 있어야 리뷰를 남길 수 있다(QA #43).
    if (!loanRepo.hasByUserAndBook(me.id, bookId)) {
      throw new ApiError(403, '이 책을 대출한 기록이 있어야 리뷰를 남길 수 있어요')
    }

    // 1인 1책 1리뷰(QA #18) — 이미 남긴 리뷰가 있으면 수정/삭제를 안내한다.
    if (reviewRepo.findByBookAndUser(bookId, me.id)) {
      throw new ApiError(409, '이미 이 책에 리뷰를 남기셨어요. 기존 리뷰를 수정하거나 삭제한 뒤 다시 남겨주세요.')
    }

    const review = reviewRepo.insert(bookId, me.id, rating, content.trim())
    setResponseStatus(event, 201)
    return review
  })
)
