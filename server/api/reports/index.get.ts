import { reportRepo } from '../../repositories/reportRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { Report } from '../../../shared/types'

const STATUSES: Report['status'][] = ['pending', 'resolved']

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const q = getQuery(event)
    const status = typeof q.status === 'string' ? q.status : undefined
    if (status && !STATUSES.includes(status as Report['status'])) {
      throw new ApiError(400, '지원하지 않는 상태예요')
    }

    return reportRepo.listByStatus(status as Report['status'] | undefined)
  })
)
