import { runAgent } from '../../ai/agent'
import { aiSettingsRepo } from '../../repositories/aiSettingsRepo'
import { aiUsageRepo } from '../../repositories/aiUsageRepo'
import { bookRepo } from '../../repositories/bookRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { AiAnswer, Book, PlaceEvidence } from '../../../shared/types'

const MAX_MESSAGES = 12

interface ChatBody {
  messages: { role: 'user' | 'assistant'; content: string }[]
  context?: { path?: string; bookId?: number }
}

export default defineEventHandler(
  handleApi(async (event): Promise<AiAnswer & { books: Book[]; places: PlaceEvidence[] }> => {
    const me = requireUser(event)
    const { messages, context } = await readBody<ChatBody>(event)

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ApiError(400, '메시지가 필요해요')
    }
    if (messages.at(-1)?.role !== 'user') {
      throw new ApiError(400, '마지막 메시지는 사용자 메시지여야 해요')
    }

    const recent = messages.slice(-MAX_MESSAGES)

    let systemExtra = ''
    if (context?.path) {
      systemExtra += `\n\n사용자의 현재 페이지: ${context.path}`
    }
    if (context?.bookId) {
      const book = bookRepo.findById(context.bookId)
      if (book) {
        systemExtra += `\n\n사용자가 지금 보고 있는 책: "${book.title}" (저자: ${book.author}). 소개: ${book.description ?? '소개 없음'}`
      }
    }

    const setting = aiSettingsRepo.findByKey('chat')
    if (!setting) throw new ApiError(503, 'AI를 사용할 수 없어요')

    const { anthropicApiKey, kakaoRestKey } = useRuntimeConfig(event)
    const { answer, usage, places } = await runAgent(
      { anthropicApiKey, kakaoRestKey, settings: setting },
      me.id,
      recent,
      systemExtra
    )

    aiUsageRepo.insert('chat', me.id, setting.model, usage.inputTokens, usage.outputTokens, usage.durationMs)

    const books = answer.bookIds
      .map((id) => bookRepo.findById(id))
      .filter((b): b is Book => Boolean(b))

    return { ...answer, books, places }
  })
)
