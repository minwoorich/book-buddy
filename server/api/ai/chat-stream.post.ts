import { createEventStream } from 'h3'
import { streamAgent, type AgentSettings } from '../../ai/agent'
import { aiSettingsRepo } from '../../repositories/aiSettingsRepo'
import { aiUsageRepo } from '../../repositories/aiUsageRepo'
import { bookRepo } from '../../repositories/bookRepo'
import { requireUser } from '../../utils/api'
import { ApiError, toHttpError } from '../../utils/errors'
import type { AiChatStreamEvent, Book, User } from '../../../shared/types'

const MAX_MESSAGES = 12

interface ChatBody {
  messages: { role: 'user' | 'assistant'; content: string }[]
  context?: { path?: string; bookId?: number }
}

/**
 * chat.post.ts(비스트리밍)와 같은 일을 SSE로 중계하며 한다. 답변 텍스트가 다 만들어질 때까지
 * 기다리는 대신 도구 진행(tool)과 message 델타(delta)를 흘려보내고, 끝나면 done 한 방에
 * 책·액션·장소 근거를 보낸다 — 클라이언트는 텍스트를 먼저 타자기로 보여주다가 done에서
 * 버튼 UI를 붙인다. 비스트리밍 엔드포인트는 이 경로가 막혔을 때의 폴백으로 그대로 둔다.
 */
export default defineEventHandler(async (event) => {
  let me: User
  let recent: ChatBody['messages']
  let systemExtra = ''
  let setting: AgentSettings
  let anthropicApiKey: string
  let kakaoRestKey: string

  // 스트림을 열기 전 단계의 에러(401/400/503)는 평범한 JSON 에러 응답으로 내려야 한다 —
  // 한 번 SSE가 시작되면 상태 코드를 바꿀 수 없다.
  try {
    me = requireUser(event)
    const body = await readBody<ChatBody>(event)
    const messages = body?.messages
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ApiError(400, '메시지가 필요해요')
    }
    if (messages.at(-1)?.role !== 'user') {
      throw new ApiError(400, '마지막 메시지는 사용자 메시지여야 해요')
    }
    recent = messages.slice(-MAX_MESSAGES)

    const context = body?.context
    if (context?.path) {
      systemExtra += `\n\n사용자의 현재 페이지: ${context.path}`
    }
    if (context?.bookId) {
      const book = bookRepo.findById(context.bookId)
      if (book) {
        systemExtra += `\n\n사용자가 지금 보고 있는 책: "${book.title}" (저자: ${book.author}). 소개: ${book.description ?? '소개 없음'}`
      }
    }

    const found = aiSettingsRepo.findByKey('chat')
    if (!found) throw new ApiError(503, 'AI를 사용할 수 없어요')
    setting = found

    const config = useRuntimeConfig(event)
    anthropicApiKey = config.anthropicApiKey
    kakaoRestKey = config.kakaoRestKey
    if (!anthropicApiKey) throw new ApiError(503, 'AI를 사용할 수 없어요')
  } catch (e) {
    const mapped = toHttpError(e)
    if (mapped) throw createError({ ...mapped, cause: e })
    throw e
  }

  const stream = createEventStream(event)
  const send = (ev: AiChatStreamEvent) => stream.push(JSON.stringify(ev))

  // stream.send()로 응답을 먼저 시작시키고, 실제 진행은 백그라운드에서 계속하며 push한다.
  ;(async () => {
    try {
      const { answer, usage, places, recommend } = await streamAgent(
        { anthropicApiKey, kakaoRestKey, settings: setting },
        me.id,
        recent,
        systemExtra,
        (agentEvent) => {
          void send(agentEvent)
        }
      )

      aiUsageRepo.insert('chat', me.id, setting.model, usage.inputTokens, usage.outputTokens, usage.durationMs)

      const books = answer.bookIds.map((id) => bookRepo.findById(id)).filter((b): b is Book => Boolean(b))

      await send({ type: 'done', answer, books, places, recommend })
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'AI 응답 중 문제가 발생했어요'
      await send({ type: 'error', message })
    } finally {
      await stream.close()
    }
  })()

  return stream.send()
})
