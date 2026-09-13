import { wishlistRepo } from '../../repositories/wishlistRepo'
import { handleApi, requireUser, parseQueryUserId } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const q = getQuery(event)

    const userId = parseQueryUserId(q.userId) ?? me.id
    if (userId !== me.id && me.role !== 'admin') throw new ApiError(403, '권한이 없어요')

    return wishlistRepo.listByUser(userId)
  })
)
