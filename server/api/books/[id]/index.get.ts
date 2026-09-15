import { bookRepo } from '../../../repositories/bookRepo'
import { loanRepo } from '../../../repositories/loanRepo'
import { reservationRepo } from '../../../repositories/reservationRepo'
import { reviewRepo } from '../../../repositories/reviewRepo'
import { wishlistRepo } from '../../../repositories/wishlistRepo'
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
    const wishCount = wishlistRepo.countByBook(id)

    const me = optionalUser(event)
    const activeLoan = loanRepo.activeByBook(id)
    const myActiveLoanId = me && activeLoan && activeLoan.userId === me.id ? activeLoan.id : null
    const wished = me ? wishlistRepo.existsByUserAndBook(me.id, id) : false
    // 내가 이 책을 예약 대기 중인지 — 상세 화면에서 "예약하기" 대신 "예약 중"을 보여준다(QA #38).
    const reservedByMe = me ? reservationRepo.waitingByUser(me.id).some((r) => r.bookId === id) : false

    return {
      ...book,
      ...status,
      avgRating: avg,
      reviewCount: count,
      wishCount,
      ...(me ? { myState: { myActiveLoanId, wished, reservedByMe } } : {}),
    }
  })
)
