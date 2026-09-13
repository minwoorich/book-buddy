import { bookRepo } from '../../repositories/bookRepo'
import { wishlistRepo } from '../../repositories/wishlistRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const { bookId } = await readBody<{ bookId: number }>(event)
    if (!bookId) throw new ApiError(400, '책을 선택해주세요')
    if (!bookRepo.findById(bookId)) throw new ApiError(404, '없는 책이에요')

    const wishlist = wishlistRepo.insert(me.id, bookId)
    setResponseStatus(event, 201)
    return wishlist
  })
)
