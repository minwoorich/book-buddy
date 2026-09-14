import { aiSettingsRepo } from '../../../repositories/aiSettingsRepo'
import { handleApi, requireAdmin } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

interface AiSettingPatchBody {
  systemPrompt?: string
  model?: string
  maxTokens?: number
  temperature?: number
  recursionLimit?: number | null
}

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const key = getRouterParam(event, 'key') ?? ''
    const existing = aiSettingsRepo.findByKey(key)
    if (!existing) throw new ApiError(404, '없는 설정이에요')

    const body = await readBody<AiSettingPatchBody>(event)

    if (body.systemPrompt !== undefined && !body.systemPrompt.trim()) {
      throw new ApiError(400, '프롬프트를 입력해주세요')
    }
    if (body.model !== undefined && !body.model.trim()) {
      throw new ApiError(400, '모델을 입력해주세요')
    }
    if (
      body.maxTokens !== undefined &&
      (!Number.isFinite(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 8000)
    ) {
      throw new ApiError(400, 'maxTokens는 1~8000 사이여야 해요')
    }
    if (
      body.temperature !== undefined &&
      (!Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 1)
    ) {
      throw new ApiError(400, 'temperature는 0~1 사이여야 해요')
    }
    if (
      body.recursionLimit !== undefined &&
      body.recursionLimit !== null &&
      (!Number.isFinite(body.recursionLimit) || body.recursionLimit < 1 || body.recursionLimit > 25)
    ) {
      throw new ApiError(400, 'recursionLimit은 1~25 또는 null이어야 해요')
    }

    return aiSettingsRepo.update(key, body)!
  })
)
