import { reportRepo } from '../../repositories/reportRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { Report } from '../../../shared/types'

const TARGET_TYPES: Report['targetType'][] = ['book', 'post', 'review']

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const { targetType, targetId, reason } = await readBody<{
      targetType?: string
      targetId?: number
      reason?: string
    }>(event)

    if (!targetType || !targetId || !reason?.trim()) {
      throw new ApiError(400, '신고 대상과 사유를 입력해주세요')
    }
    if (!TARGET_TYPES.includes(targetType as Report['targetType'])) {
      throw new ApiError(400, '지원하지 않는 신고 대상이에요')
    }

    const report = reportRepo.insert(me.id, targetType as Report['targetType'], targetId, reason.trim())
    setResponseStatus(event, 201)
    return report
  })
)
