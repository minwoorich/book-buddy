import { ChatAnthropic } from '@langchain/anthropic'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { isAIMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AiAnswer, PlaceEvidence, PlaceRecommendation } from '../../shared/types'
import { isPlaceTagCode, PLACE_TAG_LABEL } from '../../shared/constants/placeTags'
import { ApiError } from '../utils/errors'
import { parseAiAnswer } from './parse'
import { enrichAnswer, recentBookIdsFromHistory } from './enrich'
import { resolveTemperature } from './defaults'
import { createMessageExtractor } from './streamText'
import { collectPlaceEvidence, toolMessageFromStreamEvent, type ToolMessageLike } from './placeEvidence'
import { bookIdsFromTools } from './bookMention'
import { createPlaceCollector, pickRecommendation, withPlaceAction, type PlaceCollector } from './placeCollector'
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
import { makeSearchReadingPlaces } from './tools/searchReadingPlaces'
import { makeSearchReviewedPlaces } from './tools/searchReviewedPlaces'

/**
 * Task 9의 조회 도구 5종 + Task 10의 행동 도구 5종 + 장소 도구 2종을 조합한다.
 * 장소 도구는 짝이다 — search_reading_places는 "가까운 곳"(카카오 검색 + 사내 후기 요약),
 * search_reviewed_places는 "동료들이 좋다고 한 곳"(사내 후기만)을 맡는다.
 *
 * placeCollector를 주면 근처 검색 도구가 원본 장소·사업장을 그리로 흘려보낸다(지도 마킹용).
 */
export function createTools(
  userId: number,
  opts: { kakaoRestKey: string },
  placeCollector?: PlaceCollector
): StructuredToolInterface[] {
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
    makeSearchReadingPlaces(opts.kakaoRestKey, userId, placeCollector),
    makeSearchReviewedPlaces(),
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

/** streamAgent가 진행 중 흘려보내는 이벤트. done/error는 엔드포인트가 별도로 보낸다. */
export type AgentStreamEvent = { type: 'tool'; name: string; detail: string } | { type: 'delta'; text: string }

/**
 * 모델이 준 bookIds가 비어 있으면, 도구 결과로 확인된 책 중 본문이 실제로 부른 것을 채운다.
 * 모델이 도구 호출 중간 턴에 추천 본문을 써 버리면 최종 턴에는 bookIds가 안 남아, 채팅에
 * 책 카드가 하나도 뜨지 않았다(운영 재현). 모델이 제대로 준 경우엔 그대로 둔다.
 */
function withMentionedBooks(bookIds: number[], toolMessages: ToolMessageLike[], message: string): number[] {
  if (bookIds.length > 0) return bookIds
  return bookIdsFromTools(toolMessages, message)
}

/** 도구 루프가 recursionLimit에 닿았을 때 LangGraph가 던지는 에러인지 판별한다. */
function isGraphRecursionError(e: unknown): boolean {
  return e instanceof Error && ('lc_error_code' in e ? (e as { lc_error_code?: string }).lc_error_code : '') === 'GRAPH_RECURSION_LIMIT'
}

/** recursionLimit 초과 시 runAgent/streamAgent가 공통으로 돌려주는 부드러운 안내 답변. */
function recursionFallbackAnswer(
  startedAt: number
): { answer: AiAnswer; usage: AgentUsage; places: PlaceEvidence[]; recommend: PlaceRecommendation | null } {
  return {
    answer: {
      message: '질문을 살피다 서가를 너무 오래 돌았어요. 조금 더 구체적으로(예: 분야나 상황을 붙여서) 다시 물어봐 주시겠어요?',
      bookIds: [],
      actions: [],
    },
    usage: { inputTokens: 0, outputTokens: 0, durationMs: Date.now() - startedAt },
    places: [],
    recommend: null,
  }
}

/**
 * Anthropic 청크의 content는 문자열이거나(구형) content block 배열일 수 있다
 * (`[{type:'text', text:'...'}, {type:'tool_use', ...}]` 등). text 파트만 이어붙인다.
 */
function extractDeltaText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const part of content) {
    if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'text') {
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string') out += text
    }
  }
  return out
}

/**
 * on_tool_start의 `data.input`은 `{ input: '<JSON 문자열>' }` 형태로 온다(LangGraph의
 * ToolNode가 도구 인자를 문자열로 직렬화해 콜백에 넘김) — 실제 파싱된 인자 객체가 아니다.
 * 그 문자열을 다시 JSON.parse해 실제 도구 인자 객체를 꺼낸다.
 */
function unwrapToolInput(raw: unknown): Record<string, unknown> {
  const wrapped = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).input : undefined
  if (typeof wrapped !== 'string') return {}
  try {
    const parsed = JSON.parse(wrapped)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** on_tool_start 이벤트의 name/input으로 사람이 읽을 짧은 활동 요약을 만든다. */
function toolDetail(name: string, input: unknown): string {
  const obj = unwrapToolInput(input)
  const str = (key: string) => (typeof obj[key] === 'string' ? (obj[key] as string) : '')
  switch (name) {
    case 'search_books':
      return [str('query'), str('category')].filter(Boolean).join(' · ')
    case 'get_book_detail':
    case 'get_reviews':
      return typeof obj.bookId === 'number' ? `#${obj.bookId}` : ''
    case 'search_external_books':
      return str('query')
    case 'search_reading_places':
      return str('kind')
    case 'search_reviewed_places':
      return isPlaceTagCode(obj.tag) ? PLACE_TAG_LABEL[obj.tag] : '동료 후기'
    default:
      return ''
  }
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
): Promise<{ answer: AiAnswer; usage: AgentUsage; places: PlaceEvidence[]; recommend: PlaceRecommendation | null }> {
  if (!deps.anthropicApiKey) {
    throw new ApiError(503, 'AI를 사용할 수 없어요')
  }

  const llm = new ChatAnthropic({
    apiKey: deps.anthropicApiKey,
    model: deps.settings.model,
    maxTokens: deps.settings.maxTokens,
    temperature: resolveTemperature(deps.settings.model, deps.settings.temperature),
  })

  const placeCollector = createPlaceCollector()
  const agent = createReactAgent({
    llm,
    tools: createTools(userId, { kakaoRestKey: deps.kakaoRestKey }, placeCollector),
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
    if (isGraphRecursionError(e)) return recursionFallbackAnswer(startedAt)
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
  // content가 블록 배열(thinking/text 등)로 오면 text 블록만 이어붙인다 — JSON.stringify를
  // 쓰면 thinking 블록의 raw JSON이 그대로 사용자에게 노출된다(QA #33·34·35).
  const content = typeof last?.content === 'string' ? last.content : extractDeltaText(last?.content)
  // 모델이 버튼을 빠뜨리거나 평문으로 답한 경우 본문·문맥으로 빠진 버튼을 채운다(enrich.ts 참고).
  const enriched = enrichAnswer(parseAiAnswer(content), { recentBookIds: recentBookIdsFromHistory(messages) })
  // 장소 도구가 돌려준 사내 후기 중 이번 답변이 실제로 근거로 쓴 것만 동봉한다 — 채팅에서
  // "후기 근거 보기"로 펼쳐 볼 수 있게. 모델이 아니라 도구 결과가 출처다(placeEvidence.ts).
  const places = collectPlaceEvidence(res.messages, enriched.message)
  // 같은 판정으로 "이번에 추천한 장소"를 정하고, /places 버튼이 사업장·추천 장소를 들고 가게 한다.
  const recommend = pickRecommendation(placeCollector.records(), enriched.message)
  const answer = {
    ...enriched,
    bookIds: withMentionedBooks(enriched.bookIds, res.messages, enriched.message),
    actions: withPlaceAction(enriched.actions, recommend),
  }

  return { answer, usage: { inputTokens, outputTokens, durationMs }, places, recommend }
}

/**
 * runAgent의 스트리밍 버전. LangGraph의 `streamEvents(v2)`로 도구 호출 시작과 LLM 텍스트
 * 델타를 실시간으로 emit하면서도, 최종 신뢰 소스는 runAgent와 동일하게 "누적된 최종 턴
 * 텍스트를 parseAiAnswer로 파싱한 결과"로 유지한다.
 *
 * ReAct 루프는 LLM을 여러 번 호출할 수 있다(도구 호출 결정 턴 → 도구 실행 → 최종 답변
 * 턴 등). on_chat_model_start마다 누적 버퍼와 message 추출기를 리셋해, 마지막에 남는
 * 텍스트가 항상 "가장 최근(=최종) 턴"의 것이 되게 한다 — runAgent가 `res.messages.at(-1)`로
 * 마지막 메시지만 쓰는 것과 같은 효과다.
 */
export async function streamAgent(
  deps: AgentDeps,
  userId: number,
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemExtra: string,
  emit: (ev: AgentStreamEvent) => void
): Promise<{ answer: AiAnswer; usage: AgentUsage; places: PlaceEvidence[]; recommend: PlaceRecommendation | null }> {
  if (!deps.anthropicApiKey) {
    throw new ApiError(503, 'AI를 사용할 수 없어요')
  }

  const llm = new ChatAnthropic({
    apiKey: deps.anthropicApiKey,
    model: deps.settings.model,
    maxTokens: deps.settings.maxTokens,
    temperature: resolveTemperature(deps.settings.model, deps.settings.temperature),
  })

  // 장소 근거·추천은 runAgent와 같은 방식으로 모은다 — 모델이 아니라 도구 결과가 출처다.
  const placeCollector = createPlaceCollector()
  const agent = createReactAgent({
    llm,
    tools: createTools(userId, { kakaoRestKey: deps.kakaoRestKey }, placeCollector),
    prompt: deps.settings.systemPrompt + systemExtra,
  })

  const startedAt = Date.now()
  let fullText = ''
  let extractor = createMessageExtractor()
  let inputTokens = 0
  let outputTokens = 0
  // runAgent의 `res.messages` 대신, 도구가 끝날 때마다 같은 모양으로 쌓아 둔다(근거 판정용).
  const toolMessages: ToolMessageLike[] = []

  try {
    const eventStream = agent.streamEvents(
      { messages },
      {
        version: 'v2' as const,
        ...(deps.settings.recursionLimit ? { recursionLimit: deps.settings.recursionLimit } : {}),
      }
    )

    for await (const ev of eventStream) {
      if (ev.event === 'on_chat_model_start') {
        // 새 LLM 턴이 시작됐다 — 이전 턴(도구 호출 결정 등)의 텍스트는 최종 답변이
        // 아니므로 버리고 이번 턴부터 다시 쌓는다.
        fullText = ''
        extractor = createMessageExtractor()
      } else if (ev.event === 'on_tool_start') {
        emit({ type: 'tool', name: ev.name, detail: toolDetail(ev.name, (ev.data as { input?: unknown } | undefined)?.input) })
      } else if (ev.event === 'on_chat_model_stream') {
        const chunk = (ev.data as { chunk?: { content?: unknown } } | undefined)?.chunk
        const text = extractDeltaText(chunk?.content)
        if (text) {
          fullText += text
          const delta = extractor.feed(text)
          if (delta) emit({ type: 'delta', text: delta })
        }
      } else if (ev.event === 'on_tool_end') {
        const msg = toolMessageFromStreamEvent(ev.name, (ev.data as { output?: unknown } | undefined)?.output)
        if (msg) toolMessages.push(msg)
      } else if (ev.event === 'on_chat_model_end') {
        const output = (ev.data as { output?: { usage_metadata?: { input_tokens?: number; output_tokens?: number } } } | undefined)
          ?.output
        if (output?.usage_metadata) {
          inputTokens += output.usage_metadata.input_tokens ?? 0
          outputTokens += output.usage_metadata.output_tokens ?? 0
        }
      }
    }
  } catch (e) {
    if (isGraphRecursionError(e)) return recursionFallbackAnswer(startedAt)
    throw e
  }

  const durationMs = Date.now() - startedAt
  const enriched = enrichAnswer(parseAiAnswer(fullText), { recentBookIds: recentBookIdsFromHistory(messages) })
  const places = collectPlaceEvidence(toolMessages, enriched.message)
  const recommend = pickRecommendation(placeCollector.records(), enriched.message)
  const answer = {
    ...enriched,
    bookIds: withMentionedBooks(enriched.bookIds, toolMessages, enriched.message),
    actions: withPlaceAction(enriched.actions, recommend),
  }

  return { answer, usage: { inputTokens, outputTokens, durationMs }, places, recommend }
}
