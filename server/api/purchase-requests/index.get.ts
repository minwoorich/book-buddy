import { purchaseRequestRepo } from '../../repositories/purchaseRequestRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { PurchaseRequest } from '../../../shared/types'

const STATUSES: PurchaseRequest['status'][] = ['requested', 'approved', 'rejected']

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const q = getQuery(event)

    const status = typeof q.status === 'string' ? q.status : undefined
    if (status && !STATUSES.includes(status as PurchaseRequest['status'])) {
      throw new ApiError(400, '지원하지 않는 상태예요')
    }

    const queryUserId = typeof q.userId === 'string' ? Number(q.userId) : undefined
    let userId: number | undefined
    if (queryUserId !== undefined) {
      if (queryUserId !== me.id && me.role !== 'admin') throw new ApiError(403, '권한이 없어요')
      userId = queryUserId
    } else if (me.role !== 'admin') {
      userId = me.id
    }
    // userId 생략 + admin이면 userId는 undefined로 남아 전체 목록을 조회한다.

    if (userId !== undefined) {
      const list = purchaseRequestRepo.listByUser(userId)
      return status ? list.filter((r) => r.status === status) : list
    }
    return purchaseRequestRepo.listAll(status as PurchaseRequest['status'] | undefined)
  })
)
