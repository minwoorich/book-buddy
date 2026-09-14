import { qaFeedbackRepo } from '../../repositories/qaFeedbackRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { QaFeedback } from '../../../shared/types'

const STATUSES: QaFeedback['status'][] = ['open', 'resolved']

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    const { status } = await readBody<{ status?: string }>(event)

    if (!status || !STATUSES.includes(status as QaFeedback['status'])) {
      throw new ApiError(400, '지원하지 않는 상태예요')
    }
    if (!qaFeedbackRepo.findById(id)) throw new ApiError(404, '없는 피드백이에요')

    qaFeedbackRepo.updateStatus(id, status as QaFeedback['status'])
    return qaFeedbackRepo.findById(id)
  })
)
