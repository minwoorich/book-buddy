import { aiSettingsRepo } from '../../../../repositories/aiSettingsRepo'
import { handleApi, requireAdmin } from '../../../../utils/api'
import { ApiError } from '../../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const key = getRouterParam(event, 'key') ?? ''
    const existing = aiSettingsRepo.findByKey(key)
    if (!existing) throw new ApiError(404, '없는 설정이에요')

    const reset = aiSettingsRepo.resetToDefault(key)
    if (!reset) throw new ApiError(404, '없는 설정이에요')
    return reset
  })
)
