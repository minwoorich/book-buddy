import { createEventStream } from 'h3'
import { streamAgent, type AgentSettings } from '../../ai/agent'
import { aiSettingsRepo } from '../../repositories/aiSettingsRepo'
import { aiUsageRepo } from '../../repositories/aiUsageRepo'
import { bookRepo } from '../../repositories/bookRepo'
import { requireUser } from '../../utils/api'
import { ApiError, toHttpError } from '../../utils/errors'
import type { AiSearchStreamEvent, Book, User } from '../../../shared/types'

/**
 * search.post.ts(비스트리밍)와 같은 일을 SSE로 진행 중계하며 한다. 비스트리밍 엔드포인트는
 * 챗봇·폴백(이 엔드포인트 실패 시 AiSearchPanel.vue가 재시도하는 경로)용으로 그대로 둔다.
 *
 * h3의 createEventStream을 쓴다 — 헤더(text/event-stream, no-cache, keep-alive)와
 * `data: ...\n\n` 포맷팅을 대신 처리해준다.
 */
export default defineEventHandler(async (event) => {
  let me: User
  let query: string
  let setting: AgentSettings
  let anthropicApiKey: string
  let kakaoRestKey: string

  // 스트림을 열기 전(=SSE 응답이 시작되기 전) 단계의 에러는 평범한 JSON 에러 응답으로
  // 내려야 한다(예: 로그인 안 됨 401, 검색어 없음 400, 키/설정 없음 503).
  try {
    me = requireUser(event)
    const body = await readBody<{ query: string }>(event)
    query = body?.query?.trim() ?? ''
    if (!query) throw new ApiError(400, '검색어를 입력해주세요')

    const found = aiSettingsRepo.findByKey('search')
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

  const send = (ev: AiSearchStreamEvent) => stream.push(JSON.stringify(ev))

  // stream.send()로 응답을 시작시키되, 실제 진행은 백그라운드에서 계속하며 emit마다 push한다.
  ;(async () => {
    try {
      const { answer, usage } = await streamAgent(
        { anthropicApiKey, kakaoRestKey, settings: setting },
        me.id,
        [{ role: 'user', content: query }],
        '',
        (agentEvent) => {
          void send(agentEvent)
        }
      )

      aiUsageRepo.insert('search', me.id, setting.model, usage.inputTokens, usage.outputTokens, usage.durationMs)

      const books = answer.bookIds.map((id) => bookRepo.findById(id)).filter((b): b is Book => Boolean(b))

      await send({ type: 'done', answer, books })
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'AI 응답 중 문제가 발생했어요'
      await send({ type: 'error', message })
    } finally {
      await stream.close()
    }
  })()

  return stream.send()
})
