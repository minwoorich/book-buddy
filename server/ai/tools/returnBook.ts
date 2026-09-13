import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { loanService } from '../../services/loanService'
import { ApiError } from '../../utils/errors'

export const makeReturnBook = (userId: number) =>
  tool(
    async ({ loanId }) => {
      try {
        const loan = loanService.return_(userId, loanId)
        return JSON.stringify({ ok: true, returnedAt: loan.returnedAt })
      } catch (e) {
        if (e instanceof ApiError) return JSON.stringify({ ok: false, error: e.message })
        throw e
      }
    },
    {
      name: 'return_book',
      description:
        '대출을 반납 처리한다. loanId가 필요하다 — 사용자가 책 제목으로만 말해서 loanId를 모르면, 먼저 get_my_loans를 호출해 active 목록에서 해당 책의 loanId를 찾은 뒤 이 도구를 호출하라.',
      schema: z.object({ loanId: z.number().describe('반납할 대출 id (get_my_loans의 active[].loanId)') }),
    }
  )
