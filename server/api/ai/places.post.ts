import { ChatAnthropic } from '@langchain/anthropic'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import { parsePlaceRanking } from '../../ai/parse'
import { mergeRanking } from '../../services/kakaoLocalService'
import { aiSettingsRepo } from '../../repositories/aiSettingsRepo'
import { aiUsageRepo } from '../../repositories/aiUsageRepo'
import { resolveTemperature } from '../../ai/defaults'
import type { Place } from '../../../shared/types'

export default defineEventHandler(
  handleApi(async (event): Promise<{ ranked: (Place & { reason: string })[] }> => {
    const me = requireUser(event)
    const body = await readBody<{ places?: Place[] }>(event)
    const places = Array.isArray(body?.places) ? body.places : []
    if (places.length === 0) throw new ApiError(400, '장소 목록이 비어 있어요')

    const { anthropicApiKey } = useRuntimeConfig(event)
    if (!anthropicApiKey) throw new ApiError(503, 'AI를 사용할 수 없어요')

    const setting = aiSettingsRepo.findByKey('places')
    if (!setting) throw new ApiError(503, 'AI를 사용할 수 없어요')

    const llm = new ChatAnthropic({
      apiKey: anthropicApiKey,
      model: setting.model,
      maxTokens: setting.maxTokens,
      temperature: resolveTemperature(setting.model, setting.temperature),
    })

    const listText = places
      .map((p, i) => `${i + 1}. ${p.name} (${p.category || '기타'}) - ${p.address}`)
      .join('\n')

    const startedAt = Date.now()
    const res = await llm.invoke([
      { role: 'system', content: setting.systemPrompt },
      { role: 'user', content: `후보 장소 목록:\n${listText}` },
    ])
    const durationMs = Date.now() - startedAt

    const inputTokens = res.usage_metadata?.input_tokens ?? 0
    const outputTokens = res.usage_metadata?.output_tokens ?? 0
    aiUsageRepo.insert('places', me.id, setting.model, inputTokens, outputTokens, durationMs)

    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
    const ranked = parsePlaceRanking(content)

    return { ranked: mergeRanking(places, ranked) }
  })
)
