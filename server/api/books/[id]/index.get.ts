import { bookRepo } from '../../../repositories/bookRepo'
import { loanRepo } from '../../../repositories/loanRepo'
import { reviewRepo } from '../../../repositories/reviewRepo'
import { loanService } from '../../../services/loanService'
import { handleApi, optionalUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const id = Number(getRouterParam(event, 'id'))
    const book = bookRepo.findById(id)
    if (!book) throw new ApiError(404, '없는 책이에요')

    const status = loanService.bookStatus(id)
    const { avg, count } = reviewRepo.avgForBook(id)

    // wishCount/wished는 wishlistRepo가 생기는 Task 7에서 함께 추가한다.
    const me = optionalUser(event)
    const activeLoan = loanRepo.activeByBook(id)
    const myActiveLoanId = me && activeLoan && activeLoan.userId === me.id ? activeLoan.id : null

    return {
      ...book,
      ...status,
      avgRating: avg,
      reviewCount: count,
      ...(me ? { myState: { myActiveLoanId } } : {}),
    }
  })
)
