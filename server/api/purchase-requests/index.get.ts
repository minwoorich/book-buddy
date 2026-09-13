import { purchaseRequestRepo } from '../../repositories/purchaseRequestRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const q = getQuery(event)

    const queryUserId = typeof q.userId === 'string' ? Number(q.userId) : undefined
    const userId = queryUserId ?? me.id
    if (userId !== me.id && me.role !== 'admin') throw new ApiError(403, '권한이 없어요')

    return purchaseRequestRepo.listByUser(userId)
  })
)
