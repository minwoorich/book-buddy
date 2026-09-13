import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { bookRepo } from '../../repositories/bookRepo'
import { reviewRepo } from '../../repositories/reviewRepo'
import { loanService } from '../../services/loanService'

export const makeGetBookDetail = () =>
  tool(
    async ({ bookId }) => {
      const book = bookRepo.findById(bookId)
      if (!book) return JSON.stringify({ error: '해당 id의 책을 사내 서가에서 찾을 수 없어요' })

      const status = loanService.bookStatus(bookId)
      const { avg, count } = reviewRepo.avgForBook(bookId)
      const topReviews = reviewRepo
        .listByBook(bookId)
        .slice(0, 5)
        .map((r) => ({
          userName: r.userName,
          rating: r.rating,
          content: r.content,
          voteCount: r.voteCount,
        }))

      return JSON.stringify({
        id: book.id,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        category: book.category,
        description: book.description,
        pubDate: book.pubDate,
        pageCount: book.pageCount,
        status: status.status,
        dueAt: status.dueAt,
        waitingCount: status.waitingCount,
        reviewSummary: { avgRating: avg, reviewCount: count },
        topReviews,
      })
    },
    {
      name: 'get_book_detail',
      description:
        '사내 서가 도서 하나의 상세 정보(대출 상태, 대기 인원, 평균 평점, 상위 리뷰 포함)를 id로 조회한다.',
      schema: z.object({ bookId: z.number().describe('사내 서가 도서 id') }),
    }
  )
