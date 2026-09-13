import { purchaseRequestRepo } from '../../repositories/purchaseRequestRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { PurchaseRequest } from '../../../shared/types'

const STATUSES: PurchaseRequest['status'][] = ['approved', 'rejected']

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    const { status } = await readBody<{ status?: string }>(event)
    if (!status || !STATUSES.includes(status as PurchaseRequest['status'])) {
      throw new ApiError(400, '지원하지 않는 상태예요')
    }

    const existing = purchaseRequestRepo.findById(id)
    if (!existing) throw new ApiError(404, '없는 신청이에요')

    // approved여도 자동으로 책을 등록하지는 않는다 — 프론트가 이어서 책 등록 UI를 안내한다.
    purchaseRequestRepo.updateStatus(id, status as PurchaseRequest['status'])
    return purchaseRequestRepo.findById(id)!
  })
)
