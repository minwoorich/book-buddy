import { ChatAnthropic } from '@langchain/anthropic'
import type { ClubAgendaItem } from '../../shared/types'
import { aiSettingsRepo } from '../repositories/aiSettingsRepo'
import { aiUsageRepo } from '../repositories/aiUsageRepo'
import { AI_DEFAULTS, resolveTemperature } from './defaults'

/** 아젠다 생성의 입력이 되는 리뷰 한 건. */
export interface AgendaReview {
  userId: number
  userName: string
  rating: number
  content: string
}

/** 한 모임에서 다룰 질문 수 상한. 5개를 넘으면 모임 시간 안에 소화할 수 없다. */
const MAX_QUESTIONS = 5

/** 참가자 리뷰를 그대로 넣은 사용자 메시지. 요약하지 않는다 — 원문의 표현이 질문의 재료다. */
export function buildAgendaPrompt(bookTitle: string, reviews: AgendaReview[]): string {
  if (reviews.length === 0) {
    return `책 제목: ${bookTitle}\n\n참가자들이 남긴 리뷰가 없습니다. 책 제목만 보고 일반적인 토론 질문 3개를 만들어 주세요.`
  }

  const lines = reviews.map((r) => `- userId ${r.userId} · ${r.userName} · ${r.rating}점: "${r.content}"`)
  return `책 제목: ${bookTitle}\n\n참가자들이 남긴 리뷰:\n${lines.join('\n')}`
}

/** 모델 출력에서 JSON 본문만 꺼낸다 — 코드펜스로 감싸 오는 경우가 흔하다. */
function stripFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (fenced?.[1] ?? raw).trim()
}

export function parseAgenda(raw: string, reviews: AgendaReview[]): ClubAgendaItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(raw))
  } catch {
    return []
  }

  const questions = (parsed as { questions?: unknown })?.questions
  if (!Array.isArray(questions)) return []

  const byId = new Map(reviews.map((r) => [r.userId, r]))

  return questions
    .map((q) => {
      const question = typeof (q as { question?: unknown })?.question === 'string' ? (q as { question: string }).question.trim() : ''
      const ids = Array.isArray((q as { evidenceUserIds?: unknown })?.evidenceUserIds)
        ? ((q as { evidenceUserIds: unknown[] }).evidenceUserIds.filter((v): v is number => typeof v === 'number'))
        : []

      const evidence = ids
        .map((id) => byId.get(id))
        .filter((r): r is AgendaReview => r !== undefined)
        .map((r) => ({ userId: r.userId, userName: r.userName, quote: r.content }))

      return { question, evidence }
    })
    .filter((item) => item.question.length > 0)
    .slice(0, MAX_QUESTIONS)
}

/**
 * 리뷰가 없거나 모델이 실패했을 때 쓰는 일반 질문.
 * 화면에서는 "리뷰가 없어 일반 질문입니다"를 함께 보여준다(근거가 비어 있는 것으로 구분된다).
 */
export function fallbackAgenda(bookTitle: string): ClubAgendaItem[] {
  return [
    { question: `『${bookTitle}』에서 가장 오래 기억에 남은 대목은 어디였나요?`, evidence: [] },
    { question: '읽기 전에 기대했던 것과 읽고 난 뒤의 생각이 달라진 부분이 있나요?', evidence: [] },
    { question: '이 책의 내용을 우리 일에 그대로 적용하기 어려운 지점은 어디일까요?', evidence: [] },
  ]
}

/**
 * 참가자 리뷰를 근거로 토론 질문을 만든다. 도구가 필요 없는 단발 호출이라
 * createReactAgent 대신 ChatAnthropic을 직접 쓴다.
 *
 * 실패하면 예외를 던지지 않고 폴백을 돌려준다 — 아젠다 하나 때문에 매처 전체가
 * 멈추면 그 주의 제안이 통째로 사라진다.
 */
export async function generateAgenda(
  deps: { anthropicApiKey: string },
  input: { bookTitle: string; reviews: AgendaReview[] }
): Promise<ClubAgendaItem[]> {
  if (!deps.anthropicApiKey || input.reviews.length === 0) return fallbackAgenda(input.bookTitle)

  const startedAt = Date.now()
  let model = AI_DEFAULTS.club_agenda.model
  try {
    const setting = aiSettingsRepo.findByKey('club_agenda') ?? AI_DEFAULTS.club_agenda
    model = setting.model
    const llm = new ChatAnthropic({
      apiKey: deps.anthropicApiKey,
      model: setting.model,
      maxTokens: setting.maxTokens,
      temperature: resolveTemperature(setting.model, setting.temperature),
    })

    const res = await llm.invoke([
      { role: 'system', content: setting.systemPrompt },
      { role: 'user', content: buildAgendaPrompt(input.bookTitle, input.reviews) },
    ])

    const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
    const usage = res.usage_metadata
    // userId 0 = 사람이 아닌 주기 작업이 쓴 호출. 관리자 사용량 화면에서 LEFT JOIN으로 처리된다.
    aiUsageRepo.insert(
      'club_agenda',
      0,
      setting.model,
      usage?.input_tokens ?? 0,
      usage?.output_tokens ?? 0,
      Date.now() - startedAt
    )

    const items = parseAgenda(text, input.reviews)
    return items.length > 0 ? items : fallbackAgenda(input.bookTitle)
  } catch {
    // 실패도 흔적을 남긴다 — 0토큰 행이 있어야 관리자 사용량 화면에서 "아젠다 생성이 멈췄다"를 알 수 있다.
    try {
      aiUsageRepo.insert('club_agenda', 0, model, 0, 0, Date.now() - startedAt)
    } catch {
      // 사용량 기록 실패까지 매처를 멈추게 하지는 않는다.
    }
    return fallbackAgenda(input.bookTitle)
  }
}
