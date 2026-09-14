import { ChatAnthropic } from '@langchain/anthropic'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AiAnswer } from '../../shared/types'
import { ApiError } from '../utils/errors'
import { SYSTEM_PROMPT } from './prompts'
import { parseAiAnswer } from './parse'
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

/**
 * agent.ts는 Nitro 컨텍스트 밖(검증 스크립트, 향후 워커 등)에서도 실행 가능해야 하므로
 * useRuntimeConfig()를 직접 호출하지 않는다 — 호출부(Task 10의 API 핸들러 등)가
 * useRuntimeConfig()에서 읽은 키를 deps로 넘긴다.
 */
export async function runAgent(
  deps: { anthropicApiKey: string; kakaoRestKey: string },
  userId: number,
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemExtra = ''
): Promise<AiAnswer> {
  if (!deps.anthropicApiKey) {
    throw new ApiError(503, 'AI를 사용할 수 없어요')
  }

  const llm = new ChatAnthropic({
    apiKey: deps.anthropicApiKey,
    model: 'claude-sonnet-5',
    maxTokens: 1500,
  })

  const agent = createReactAgent({
    llm,
    tools: createTools(userId, { kakaoRestKey: deps.kakaoRestKey }),
    prompt: SYSTEM_PROMPT + systemExtra,
  })

  const res = await agent.invoke({ messages }, { recursionLimit: 12 })
  const last = res.messages.at(-1)
  const content = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content)
  return parseAiAnswer(content)
}
