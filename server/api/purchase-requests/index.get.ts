import { purchaseRequestRepo } from '../../repositories/purchaseRequestRepo'
import { handleApi, requireUser, parseQueryUserId } from '../../utils/api'
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

    const scopeAll = q.scope === 'all'

    const queryUserId = parseQueryUserId(q.userId)
    let userId: number | undefined
    if (queryUserId !== undefined) {
      if (queryUserId !== me.id && me.role !== 'admin') throw new ApiError(403, '권한이 없어요')
      userId = queryUserId
    } else if (scopeAll) {
      // 전체 조회는 opt-in(?scope=all)이고 admin 전용이다.
      if (me.role !== 'admin') throw new ApiError(403, '권한이 없어요')
      userId = undefined
    } else {
      // userId 생략 + scope=all 아님 → admin이어도 기본은 항상 본인 것만.
      userId = me.id
    }

    if (userId !== undefined) {
      const list = purchaseRequestRepo.listByUser(userId)
      return status ? list.filter((r) => r.status === status) : list
    }
    return purchaseRequestRepo.listAll(status as PurchaseRequest['status'] | undefined)
  })
)
