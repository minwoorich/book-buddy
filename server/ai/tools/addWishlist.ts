import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { wishlistRepo } from '../../repositories/wishlistRepo'
import { ApiError } from '../../utils/errors'

export const makeAddWishlist = (userId: number) =>
  tool(
    async ({ bookId }) => {
      try {
        const wishlist = wishlistRepo.insert(userId, bookId)
        return JSON.stringify({ ok: true, wishlistId: wishlist.id })
      } catch (e) {
        if (e instanceof ApiError) return JSON.stringify({ ok: false, error: e.message })
        throw e
      }
    },
    {
      name: 'add_wishlist',
      description: '사내 서가 도서를 찜(위시리스트)에 추가한다. 이미 찜한 책이면 실패할 수 있다.',
      schema: z.object({ bookId: z.number().describe('찜할 사내 서가 도서 id') }),
    }
  )
