import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { bookRepo } from '../../repositories/bookRepo'
import { loanService } from '../../services/loanService'

export const makeSearchBooks = () =>
  tool(
    async ({ query, category }) =>
      JSON.stringify(
        bookRepo
          .findAll({ query, category })
          .slice(0, 8)
          .map((b) => ({
            id: b.id,
            title: b.title,
            author: b.author,
            category: b.category,
            status: loanService.bookStatus(b.id).status,
          }))
      ),
    {
      name: 'search_books',
      description: '사내 서가에서 제목/저자 키워드나 카테고리로 도서를 검색한다. 결과에 대출 상태를 포함한다.',
      schema: z.object({
        query: z.string().optional().describe('제목/저자에 포함될 검색어'),
        category: z.string().optional().describe('카테고리(정확히 일치)'),
      }),
    }
  )
