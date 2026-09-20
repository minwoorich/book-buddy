import type { ToolMessageLike } from './placeEvidence'

/**
 * 답변 본문이 실제로 부른 사내 도서를 도구 결과에서 되살린다.
 *
 * 모델이 도구를 부르는 중간 턴에 추천 본문을 써 버리면, 최종 답은 그다음 턴의 짧은 마무리가
 * 되고 그 턴의 bookIds는 비어 온다 — 채팅에 책 카드가 하나도 안 뜬다(운영 재현).
 * 프롬프트로 1차 방어하되, 여기서 "도구가 돌려준 책 중 본문에 제목이 나온 것"만 결정적으로
 * 채운다. 장소 근거(placeEvidence)와 같은 결 — 근거는 모델의 말이 아니라 도구 결과다.
 */

/** 사내 서가 도서를 돌려주는 도구들. 장소·외부 서점 도구는 사내 id가 아니라 제외한다. */
const BOOK_TOOLS = new Set(['search_books', 'get_book_detail', 'get_reviews', 'get_my_loans'])

const MAX_BOOKS = 6

interface BookLike {
  id: number
  title: string
}

/** 제목 표기 차이를 흡수한다 — 공백과 괄호·따옴표류는 무시하고 견준다. */
function squash(s: string): string {
  return s.replace(/[\s()[\]{}『』「」《》<>"'·,]/g, '')
}

/**
 * 부제를 떼어낸 앞부분. 모델은 "설득의 심리학 1(20주년 기념 개정증보판)"을 본문에서
 * "설득의 심리학 1"로만 부르는 일이 잦다. 너무 짧은 조각은(예: "책 (1)") 엉뚱한 책에
 * 걸릴 수 있어 4자 미만이면 쓰지 않는다.
 */
const MIN_BASE_TITLE = 4
function baseTitle(title: string): string | null {
  const head = title.split(/[(:\-–—]/)[0] ?? ''
  const squashed = squash(head)
  return squashed.length >= MIN_BASE_TITLE && squashed !== squash(title) ? squashed : null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function toBook(raw: unknown): BookLike | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'number' ? raw.id : typeof raw.bookId === 'number' ? raw.bookId : null
  if (id === null || !Number.isFinite(id) || typeof raw.title !== 'string') return null
  return { id, title: raw.title }
}

/** 도구 결과 JSON에서 책 항목을 꺼낸다. 배열·{books:[...]}·단일 객체를 모두 받는다. */
function booksFrom(msg: ToolMessageLike): BookLike[] {
  if (!msg.name || !BOOK_TOOLS.has(msg.name) || typeof msg.content !== 'string') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(msg.content)
  } catch {
    return []
  }
  const candidates: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? [
          ...(Array.isArray(parsed.books) ? parsed.books : []),
          ...(Array.isArray(parsed.active) ? parsed.active : []),
          ...(Array.isArray(parsed.recentReturned) ? parsed.recentReturned : []),
          parsed,
        ]
      : []
  return candidates.map(toBook).filter((b): b is BookLike => b !== null)
}

/**
 * 본문에 제목이 나온 사내 도서의 id — 본문에 등장한 순서대로, 중복 없이 최대 6권.
 * 책 카드 순서가 글에서 읽은 순서와 같아야 사용자가 둘을 짝지을 수 있다.
 */
export function bookIdsFromTools(toolMessages: ToolMessageLike[], answerText: string): number[] {
  const text = squash(answerText)
  const found: { id: number; at: number }[] = []
  for (const msg of toolMessages) {
    for (const book of booksFrom(msg)) {
      if (found.some((f) => f.id === book.id)) continue
      const base = baseTitle(book.title)
      const at = text.indexOf(squash(book.title))
      const where = at >= 0 ? at : base ? text.indexOf(base) : -1
      if (where >= 0) found.push({ id: book.id, at: where })
    }
  }
  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_BOOKS)
    .map((f) => f.id)
}
