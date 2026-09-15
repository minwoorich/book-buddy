import type { AiAnswer, Book, ChatAction } from '#shared/types'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  books?: Book[]
  actions?: ChatAction[]
}

/**
 * 책벗(AI 챗봇) 위젯의 전역 상태.
 *
 * `useState`로 관리해서 어느 페이지/컴포넌트에서 호출해도 같은 대화(열림 여부,
 * 메시지 목록, 전송 상태, 책 상세에서 넘어온 bookId 컨텍스트)를 공유한다.
 */
const CHAT_STORAGE_KEY = 'bb:chat:messages'
const MAX_PERSISTED_MESSAGES = 60

/** 새로고침해도 대화가 유지되도록(QA #32) sessionStorage에서 복원한다 — 탭을 닫으면 초기화. */
function restoreMessages(): ChatMsg[] {
  if (!import.meta.client) return []
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as ChatMsg[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistMessages(list: ChatMsg[]) {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(list.slice(-MAX_PERSISTED_MESSAGES)))
  } catch {
    // 저장 실패(프라이빗 모드·용량 초과)는 무시 — 대화 진행 자체를 막으면 안 된다.
  }
}

export function useChat() {
  const open = useState<boolean>('bb:chat:open', () => false)
  const messages = useState<ChatMsg[]>('bb:chat:messages', () => restoreMessages())
  const sending = useState<boolean>('bb:chat:sending', () => false)
  const contextBookId = useState<number | undefined>('bb:chat:bookId', () => undefined)

  // 메시지가 바뀔 때마다 저장한다. useChat은 여러 곳에서 호출되므로 watcher는 한 번만 건다.
  const persistArmed = useState<boolean>('bb:chat:persist-armed', () => false)
  if (import.meta.client && !persistArmed.value) {
    persistArmed.value = true
    watch(messages, (list) => persistMessages(list), { deep: true })
  }

  const api = useApi()
  const route = useRoute()

  /** 챗 패널을 연다. bookId를 넘기면 이후 send()에서 그 책을 컨텍스트로 전송한다. */
  function openWith(bookId?: number) {
    if (bookId !== undefined) contextBookId.value = bookId
    open.value = true
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending.value) return

    messages.value.push({ role: 'user', content: trimmed })
    sending.value = true
    try {
      const history = messages.value.map(({ role, content }) => ({ role, content }))
      const answer = await api<AiAnswer & { books: Book[] }>('/api/ai/chat', {
        method: 'POST',
        body: {
          messages: history,
          context: { path: route.fullPath, bookId: contextBookId.value },
        },
      })
      messages.value.push({
        role: 'assistant',
        content: answer.message,
        books: answer.books,
        // 확인 질문("~할까요?")엔 네/아니오 퀵리플라이가 항상 붙도록 보정(QA #57)
        actions: ensureQuickReplies(answer.message, answer.actions),
      })
    } catch (e) {
      messages.value.push({ role: 'assistant', content: apiErrorMessage(e) })
    } finally {
      sending.value = false
    }
  }

  return { open, messages, sending, send, openWith }
}
