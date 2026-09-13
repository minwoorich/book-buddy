import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { loanService } from '../../services/loanService'
import { ApiError } from '../../utils/errors'

/**
 * 행동 도구 공통 규약: 성공 시 { ok: true, ... }, ApiError(대출 불가 등 예상된 실패)는
 * throw하지 않고 { ok: false, error } 로 변환해 모델이 사용자에게 설명하게 한다.
 * 예상 밖 에러(ApiError가 아닌 것)는 그대로 rethrow한다.
 */
export const makeBorrowBook = (userId: number) =>
  tool(
    async ({ bookId }) => {
      try {
        const loan = loanService.borrow(userId, bookId)
        return JSON.stringify({ ok: true, loanId: loan.id, dueAt: loan.dueAt })
      } catch (e) {
        if (e instanceof ApiError) return JSON.stringify({ ok: false, error: e.message })
        throw e
      }
    },
    {
      name: 'borrow_book',
      description:
        '사내 서가 도서를 대출한다. 이미 대출 중이거나 다른 사람의 예약이 있으면 실패할 수 있으니, 실패 시 결과의 error 메시지를 사용자에게 그대로 설명하라.',
      schema: z.object({ bookId: z.number().describe('대출할 사내 서가 도서 id') }),
    }
  )
