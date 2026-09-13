import type { AiAnswer, Book, ChatAction } from '#shared/types'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  books?: Book[]
  actions?: ChatAction[]
}

/**
 * AI 사서 챗봇 위젯의 전역 상태.
 *
 * `useState`로 관리해서 어느 페이지/컴포넌트에서 호출해도 같은 대화(열림 여부,
 * 메시지 목록, 전송 상태, 책 상세에서 넘어온 bookId 컨텍스트)를 공유한다.
 */
export function useChat() {
  const open = useState<boolean>('bb:chat:open', () => false)
  const messages = useState<ChatMsg[]>('bb:chat:messages', () => [])
  const sending = useState<boolean>('bb:chat:sending', () => false)
  const contextBookId = useState<number | undefined>('bb:chat:bookId', () => undefined)

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
        actions: answer.actions,
      })
    } catch (e) {
      messages.value.push({ role: 'assistant', content: apiErrorMessage(e) })
    } finally {
      sending.value = false
    }
  }

  return { open, messages, sending, send, openWith }
}
