import { qaFeedbackRepo } from '../../repositories/qaFeedbackRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { QaFeedback } from '../../../shared/types'

const STATUSES: QaFeedback['status'][] = ['open', 'resolved']

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const { status } = getQuery(event)
    if (status !== undefined && !STATUSES.includes(status as QaFeedback['status'])) {
      throw new ApiError(400, '지원하지 않는 상태예요')
    }
    return qaFeedbackRepo.listByStatus(status as QaFeedback['status'] | undefined)
  })
)
