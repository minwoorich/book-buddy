import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { reviewRepo } from '../../repositories/reviewRepo'

export const makeGetReviews = () =>
  tool(
    async ({ bookId }) =>
      JSON.stringify(
        reviewRepo
          .listByBook(bookId)
          .slice(0, 10)
          .map((r) => ({
            userName: r.userName,
            department: r.department,
            rating: r.rating,
            content: r.content,
            voteCount: r.voteCount,
            createdAt: r.createdAt,
          }))
      ),
    {
      name: 'get_reviews',
      description: '특정 도서의 리뷰 목록(추천수 상위 최대 10건)을 추천수(voteCount) 내림차순으로 조회한다.',
      schema: z.object({ bookId: z.number().describe('사내 서가 도서 id') }),
    }
  )
