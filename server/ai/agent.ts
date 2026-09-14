import { ChatAnthropic } from '@langchain/anthropic'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { isAIMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AiAnswer } from '../../shared/types'
import { ApiError } from '../utils/errors'
import { parseAiAnswer } from './parse'
import { resolveTemperature } from './defaults'
import { makeSearchBooks } from './tools/searchBooks'
import { makeGetBookDetail } from './tools/getBookDetail'
import { makeGetMyLoans } from './tools/getMyLoans'
import { makeGetReviews } from './tools/getReviews'
import { makeSearchExternalBooks } from './tools/searchExternalBooks'
import { makeBorrowBook } from './tools/borrowBook'
import { makeReturnBook } from './tools/returnBook'
import { makeReserveBook } from './tools/reserveBook'
import { makeRequestPurchase } from './tools/requestPurchase'
import { makeAddWishlist } from './tools/addWishlist'

/**
 * Task 9의 조회 도구 5종 + Task 10의 행동 도구 5종을 조합한다.
 */
export function createTools(userId: number, opts: { kakaoRestKey: string }): StructuredToolInterface[] {
  return [
    makeSearchBooks(),
    makeGetBookDetail(),
    makeGetMyLoans(userId),
    makeGetReviews(),
    makeSearchExternalBooks(opts.kakaoRestKey),
    makeBorrowBook(userId),
    makeReturnBook(userId),
    makeReserveBook(userId),
    makeRequestPurchase(userId),
    makeAddWishlist(userId),
  ]
}

/** ai_settings 테이블(관리자 편집 대상)에서 로드한, LLM 호출에 필요한 값들. */
export interface AgentSettings {
  systemPrompt: string
  model: string
  maxTokens: number
  temperature: number
  recursionLimit: number | null
}

export interface AgentUsage {
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export interface AgentDeps {
  anthropicApiKey: string
  kakaoRestKey: string
  settings: AgentSettings
}

/**
 * agent.ts는 Nitro 컨텍스트 밖(검증 스크립트, 향후 워커 등)에서도 실행 가능해야 하므로
 * useRuntimeConfig()를 직접 호출하지 않는다 — 호출부(Task 10의 API 핸들러 등)가
 * useRuntimeConfig()에서 읽은 키와 aiSettingsRepo에서 읽은 settings를 deps로 넘긴다.
 */
export async function runAgent(
  deps: AgentDeps,
  userId: number,
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemExtra = ''
): Promise<{ answer: AiAnswer; usage: AgentUsage }> {
  if (!deps.anthropicApiKey) {
    throw new ApiError(503, 'AI를 사용할 수 없어요')
  }

  const llm = new ChatAnthropic({
    apiKey: deps.anthropicApiKey,
    model: deps.settings.model,
    maxTokens: deps.settings.maxTokens,
    temperature: resolveTemperature(deps.settings.model, deps.settings.temperature),
  })

  const agent = createReactAgent({
    llm,
    tools: createTools(userId, { kakaoRestKey: deps.kakaoRestKey }),
    prompt: deps.settings.systemPrompt + systemExtra,
  })

  const startedAt = Date.now()
  let res
  try {
    res = await agent.invoke(
      { messages },
      deps.settings.recursionLimit ? { recursionLimit: deps.settings.recursionLimit } : undefined
    )
  } catch (e) {
    // 도구 루프가 한도(recursionLimit)에 닿으면 500 대신 부드러운 안내로 폴백한다.
    if (e instanceof Error && ('lc_error_code' in e ? (e as { lc_error_code?: string }).lc_error_code : '') === 'GRAPH_RECURSION_LIMIT') {
      return {
        answer: {
          message: '질문을 살피다 서가를 너무 오래 돌았어요. 조금 더 구체적으로(예: 분야나 상황을 붙여서) 다시 물어봐 주시겠어요?',
          bookIds: [],
          actions: [],
        },
        usage: { inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startedAt },
      }
    }
    throw e
  }
  const durationMs = Date.now() - startedAt

  let inputTokens = 0
  let outputTokens = 0
  for (const m of res.messages) {
    if (isAIMessage(m) && m.usage_metadata) {
      inputTokens += m.usage_metadata.input_tokens ?? 0
      outputTokens += m.usage_metadata.output_tokens ?? 0
    }
  }

  const last = res.messages.at(-1)
  const content = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content)
  const answer = parseAiAnswer(content)

  return { answer, usage: { inputTokens, outputTokens, durationMs } }
}
