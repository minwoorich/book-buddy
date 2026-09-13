import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { loanService } from '../../services/loanService'
import { ApiError } from '../../utils/errors'

export const makeReserveBook = (userId: number) =>
  tool(
    async ({ bookId }) => {
      try {
        const reservation = loanService.reserve(userId, bookId)
        return JSON.stringify({ ok: true, reservationId: reservation.id })
      } catch (e) {
        if (e instanceof ApiError) return JSON.stringify({ ok: false, error: e.message })
        throw e
      }
    },
    {
      name: 'reserve_book',
      description:
        '다른 사람이 대출 중인 책을 예약(대기)한다. 대출 가능한(비어 있는) 책이면 예약이 아니라 borrow_book을 사용하라.',
      schema: z.object({ bookId: z.number().describe('예약할 사내 서가 도서 id') }),
    }
  )
