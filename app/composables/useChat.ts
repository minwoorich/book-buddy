import type { AiAnswer, AiChatStreamEvent, Book, ChatAction, PlaceEvidence, PlaceRecommendation } from '#shared/types'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  books?: Book[]
  actions?: ChatAction[]
  /** 이 답변이 장소를 추천하며 근거로 쓴 사내 후기(서버가 장소 도구 결과에서 뽑아 보낸다). */
  places?: PlaceEvidence[]
  /** 이 답변이 추천한 장소와 기준 사업장. "장소 보기" 버튼이 이걸 들고 /places로 넘어간다. */
  recommend?: PlaceRecommendation | null
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
  /** 스트리밍 중 지금까지 도착한 답변 본문(타자기 표시용). done이 오면 비우고 메시지로 옮긴다. */
  const streamText = useState<string>('bb:chat:stream-text', () => '')
  /** 스트리밍 중 가장 최근 도구가 남긴 짧은 활동 라벨("서가를 뒤지는 중" 등). */
  const activity = useState<string>('bb:chat:activity', () => '')

  // 메시지가 바뀔 때마다 저장한다. useChat은 여러 곳에서 호출되므로 watcher는 한 번만 건다.
  const persistArmed = useState<boolean>('bb:chat:persist-armed', () => false)
  if (import.meta.client && !persistArmed.value) {
    persistArmed.value = true
    watch(messages, (list) => persistMessages(list), { deep: true })
  }

  const api = useApi()
  const { user, guestToken } = useCurrentUser()
  const route = useRoute()

  /** 챗 패널을 연다. bookId를 넘기면 이후 send()에서 그 책을 컨텍스트로 전송한다. */
  function openWith(bookId?: number) {
    if (bookId !== undefined) contextBookId.value = bookId
    open.value = true
  }

  function pushAnswer(answer: AiAnswer & { books: Book[]; places: PlaceEvidence[]; recommend: PlaceRecommendation | null }) {
    messages.value.push({
      role: 'assistant',
      content: answer.message,
      books: answer.books,
      places: answer.places,
      recommend: answer.recommend,
      // 확인 질문("~할까요?")엔 네/아니오 퀵리플라이가 항상 붙도록 보정(QA #57)
      actions: ensureQuickReplies(answer.message, answer.actions),
    })
  }

  type ChatRequest = {
    messages: { role: 'user' | 'assistant'; content: string }[]
    context: { path?: string; bookId?: number }
  }

  /**
   * 스트리밍 경로가 아예 열리지 않았을 때(연결 실패·비200)만 쓰는 기존 비스트리밍 경로.
   *
   * 스트림이 열린 뒤 중간에 끊긴 경우에는 절대 부르지 않는다 — 에이전트가 이미 대출·예약
   * 같은 상태 변경 도구를 실행했을 수 있어서, 다시 돌리면 같은 동작이 두 번 일어난다.
   */
  async function sendFallback(body: ChatRequest) {
    try {
      const answer = await api<
        AiAnswer & { books: Book[]; places: PlaceEvidence[]; recommend: PlaceRecommendation | null }
      >('/api/ai/chat', { method: 'POST', body })
      pushAnswer(answer)
    } catch (e) {
      messages.value.push({ role: 'assistant', content: apiErrorMessage(e) })
    }
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending.value) return

    messages.value.push({ role: 'user', content: trimmed })
    sending.value = true
    streamText.value = ''
    activity.value = ''

    // assistant 턴은 모델이 냈던 JSON 형태로 되돌려 보낸다(app/utils/chatHistory.ts 참고).
    const body: ChatRequest = {
      messages: toChatHistory(messages.value),
      context: { path: route.fullPath, bookId: contextBookId.value },
    }

    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (user.value) headers['x-user-id'] = String(user.value.id)
      if (guestToken.value) headers['x-guest-token'] = guestToken.value

      // fetch 자체가 실패하는 경우(네트워크·프록시가 SSE를 막음)는 에이전트가 아직 돌지
      // 않았다는 뜻이므로 폴백이 안전하다. 그래서 fetch만 따로 감싼다.
      let res: Response | null = null
      try {
        res = await fetch('/api/ai/chat-stream', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      } catch {
        res = null
      }

      if (!res || !res.ok || !res.body) {
        await sendFallback(body)
        return
      }

      // 스트림이 열렸다 — 여기서부터는 폴백 금지(위 sendFallback 주석 참고).
      let settled = false
      try {
        await readSseStream<AiChatStreamEvent>(res.body, (ev) => {
          if (ev.type === 'tool') {
            activity.value = toolLabel(ev.name)
          } else if (ev.type === 'delta') {
            streamText.value += ev.text
          } else if (ev.type === 'done') {
            settled = true
            pushAnswer({ ...ev.answer, books: ev.books, places: ev.places, recommend: ev.recommend })
          } else if (ev.type === 'error') {
            settled = true
            messages.value.push({ role: 'assistant', content: ev.message })
          }
        })
      } catch {
        // 읽는 도중 끊겼다 — 아래에서 지금까지 받은 텍스트로 마무리한다(재실행하지 않는다).
      }

      // done도 error도 못 받고 연결이 끊긴 경우: 지금까지 받은 텍스트라도 남긴다.
      if (!settled) {
        messages.value.push({
          role: 'assistant',
          content: streamText.value || '답변을 받아오다 연결이 끊겼어요. 다시 한 번 물어봐 주시겠어요?',
        })
      }
    } finally {
      sending.value = false
      streamText.value = ''
      activity.value = ''
    }
  }

  return { open, messages, sending, send, openWith, streamText, activity }
}
