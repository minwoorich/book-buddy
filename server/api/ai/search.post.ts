import { runAgent } from '../../ai/agent'
import { aiSettingsRepo } from '../../repositories/aiSettingsRepo'
import { aiUsageRepo } from '../../repositories/aiUsageRepo'
import { bookRepo } from '../../repositories/bookRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { AiAnswer, Book } from '../../../shared/types'

export default defineEventHandler(
  handleApi(async (event): Promise<AiAnswer & { books: Book[] }> => {
    const me = requireUser(event)
    const { query } = await readBody<{ query: string }>(event)
    if (!query?.trim()) throw new ApiError(400, '검색어를 입력해주세요')

    const setting = aiSettingsRepo.findByKey('search')
    if (!setting) throw new ApiError(503, 'AI를 사용할 수 없어요')

    const { anthropicApiKey, kakaoRestKey } = useRuntimeConfig(event)
    const { answer, usage } = await runAgent(
      { anthropicApiKey, kakaoRestKey, settings: setting },
      me.id,
      [{ role: 'user', content: query.trim() }]
    )

    aiUsageRepo.insert('search', me.id, setting.model, usage.inputTokens, usage.outputTokens, usage.durationMs)

    const books = answer.bookIds
      .map((id) => bookRepo.findById(id))
      .filter((b): b is Book => Boolean(b))

    return { ...answer, books }
  })
)
