import { bookRepo } from '../../repositories/bookRepo'
import { reviewRepo } from '../../repositories/reviewRepo'
import { loanService } from '../../services/loanService'
import { handleApi } from '../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const q = getQuery(event)
    const query = typeof q.query === 'string' ? q.query : undefined
    const category = typeof q.category === 'string' ? q.category : undefined

    // N+1 허용 — 데모 규모(42권)라 목록 조회에서 책마다 상태/평점을 조회해도 무방하다.
    return bookRepo.findAll({ query, category }).map((book) => {
      const status = loanService.bookStatus(book.id)
      const { avg, count } = reviewRepo.avgForBook(book.id)
      return {
        ...book,
        status: status.status,
        waitingCount: status.waitingCount,
        avgRating: avg,
        reviewCount: count,
      }
    })
  })
)
