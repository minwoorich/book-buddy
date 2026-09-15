import type { ChatAction } from '#shared/types'

/** 책벗이 실행 전 확인을 구하는 말투 — "~할까요?", "~드릴까요?", "~진행할까요?" 등. */
const CONFIRM_QUESTION_RE = /(할까요|드릴까요|될까요|괜찮을까요|맞을까요|원하시나요|원하세요)\s*\?/

export const DEFAULT_QUICK_REPLIES: ChatAction[] = [
  { type: 'reply', label: '네, 진행해주세요', send: '네, 진행해줘' },
  { type: 'reply', label: '아니요', send: '아니요, 하지 말아줘' },
]

/**
 * 확인 질문에는 항상 네/아니오 퀵리플라이 버튼이 붙도록 보정한다(QA #57).
 * 프롬프트가 reply 버튼을 요구하지만 모델이 가끔 빠뜨리므로, 답변이 확인 질문 형태인데
 * reply 액션이 하나도 없으면 기본 버튼 두 개를 뒤에 덧붙인다. 이미 reply가 있으면 그대로 둔다.
 */
export function ensureQuickReplies(message: string, actions: ChatAction[] | undefined): ChatAction[] {
  const list = actions ?? []
  if (list.some((a) => a.type === 'reply')) return list
  if (!CONFIRM_QUESTION_RE.test(message)) return list
  return [...list, ...DEFAULT_QUICK_REPLIES]
}
