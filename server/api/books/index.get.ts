import { bookRepo } from '../../repositories/bookRepo'
import { loanRepo } from '../../repositories/loanRepo'
import { reviewRepo } from '../../repositories/reviewRepo'
import { loanService } from '../../services/loanService'
import { handleApi } from '../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const q = getQuery(event)
    const query = typeof q.query === 'string' ? q.query : undefined
    const category = typeof q.category === 'string' ? q.category : undefined
    // QA #15: available=1 → 지금 대출 가능한 책만, sort=popular → 누적 대출 횟수 내림차순.
    const availableOnly = q.available === '1' || q.available === 'true'
    const sort = typeof q.sort === 'string' ? q.sort : undefined

    // N+1 허용 — 데모 규모라 목록 조회에서 책마다 상태/평점을 조회해도 무방하다.
    let books = bookRepo.findAll({ query, category }).map((book) => {
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

    if (availableOnly) books = books.filter((b) => b.status === 'available')
    if (sort === 'popular') {
      const counts = loanRepo.countsByBook()
      books = [...books].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    }

    return books
  })
)
