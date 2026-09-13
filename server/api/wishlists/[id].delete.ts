import { wishlistRepo } from '../../repositories/wishlistRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))

    const wishlist = wishlistRepo.findById(id)
    if (!wishlist) throw new ApiError(404, '없는 찜이에요')
    if (wishlist.userId !== me.id) throw new ApiError(403, '본인의 찜만 삭제할 수 있어요')

    wishlistRepo.remove(id)
    setResponseStatus(event, 204)
    return null
  })
)
