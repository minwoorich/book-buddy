import type { Book, ChatAction } from '#shared/types'

export interface HistoryMsg {
  role: 'user' | 'assistant'
  content: string
  books?: Book[]
  actions?: ChatAction[]
}

/**
 * 책벗에 되돌려 보낼 대화 히스토리를 만든다.
 *
 * assistant 턴은 모델이 실제로 냈던 형태와 같은 JSON(`{"message","bookIds","actions"}`)으로
 * 되돌려 보낸다. 평문 message만 보내면 모델이 그 형식을 따라 후속 턴에서 JSON 없이 답해
 * 버튼이 사라지는 문제가 재현됐다(예: "아래 버튼을 눌러주세요!"만 오고 actions 없음).
 * 서버는 이 JSON에서 bookIds를 읽어 문맥 책도 파악한다.
 */
export function toChatHistory(messages: HistoryMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content }
    return {
      role: 'assistant',
      content: JSON.stringify({
        message: m.content,
        bookIds: (m.books ?? []).map((b) => b.id),
        actions: m.actions ?? [],
      }),
    }
  })
}
