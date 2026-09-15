import type { AiAnswer, ChatAction } from '../../shared/types'

/**
 * 모델이 버튼을 빠뜨린 답변을 결정적으로 보정한다.
 *
 * 재현된 문제: 후속 턴에서 모델이 JSON 없이 "리뷰 작성 페이지로 이동해드릴게요. 아래 버튼을
 * 눌러주세요!"처럼 평문으로 답해 actions가 비는 경우. 프롬프트·히스토리 형식으로 1차 방어를
 * 하되, 여기서 본문 키워드와 문맥(직전 턴에서 언급된 책 id)으로 필요한 버튼을 채워 넣는다.
 * 이미 같은 목적지의 버튼이 있으면 추가하지 않고, navigate는 최대 3개까지만 둔다.
 */

const MAX_NAVIGATE = 3

/** 실행 전 확인 질문 말투 — reply(네/아니오) 버튼이 있어야 한다. */
const CONFIRM_QUESTION_RE = /(할까요|드릴까요|될까요|괜찮을까요|맞을까요|원하시나요|원하세요)\s*\?/

export const DEFAULT_QUICK_REPLIES: ChatAction[] = [
  { type: 'reply', label: '네, 진행해주세요', send: '네, 진행해줘' },
  { type: 'reply', label: '아니요', send: '아니요, 하지 말아줘' },
]

/** 분야를 골라 달라는 질문 — 4개 서가 카테고리 칩을 붙인다. */
const CATEGORY_NAMES = ['경제경영', 'IT', '자기계발', '인문'] as const
const CATEGORY_QUESTION_RE = /(분야|장르|카테고리)[^?]{0,30}\?/

/** 본문 키워드 → 목적지. 순서가 곧 우선순위(먼저 매칭된 것이 앞 버튼). */
interface PageRule {
  re: RegExp
  to: string
  label: string
}
const PAGE_RULES: PageRule[] = [
  { re: /내 서재|서재에서|대출 (현황|목록|이력)|반납 (예정|기한)|찜 목록|희망도서|신청 (내역|현황|결과)/, to: '/my', label: '내 서재에서 확인하기' },
  { re: /캘린더|달력|반납일/, to: '/my', label: '내 서재 달력 보기' },
  { re: /랭킹|순위/, to: '/rankings', label: '랭킹 보러 가기' },
  { re: /피드|게시물|독서 순간/, to: '/feed', label: '피드 보러 가기' },
  { re: /읽기 좋은 장소|장소 (추천|페이지)|근처 카페|카페·도서관|카페, 도서관/, to: '/places', label: '책 읽기 좋은 장소 보기' },
  { re: /공지/, to: '/notices', label: '공지사항 보기' },
  { re: /리뷰 모아|동료(들)?의 리뷰|다른 (분들의|사람들의) 리뷰/, to: '/reviews', label: '리뷰 모아보기' },
]

/** 책과 묶이는 목적지 — 문맥에 책 id가 있어야 만들 수 있다. */
const REVIEW_WRITE_RE = /리뷰(를|도)?\s?(작성|남기|남겨|쓰|써|달|등록)/
const BOOK_DETAIL_RE = /상세 (페이지|보기|화면)|자세히 보(기|세요)|책 정보/
/** "아래 버튼", "이동해드릴게요"처럼 버튼을 약속한 문장. */
const PROMISES_BUTTON_RE = /버튼|이동해\s?드릴게요|이동할게요|바로 가실 수|바로 이동/

function hasNavigateTo(actions: ChatAction[], to: string): boolean {
  return actions.some((a) => a.type === 'navigate' && a.to === to)
}

function hasReply(actions: ChatAction[]): boolean {
  return actions.some((a) => a.type === 'reply')
}

function navigateCount(actions: ChatAction[]): number {
  return actions.filter((a) => a.type === 'navigate').length
}

function pushNavigate(actions: ChatAction[], label: string, to: string): void {
  if (hasNavigateTo(actions, to) || navigateCount(actions) >= MAX_NAVIGATE) return
  actions.push({ type: 'navigate', label, to })
}

export interface EnrichContext {
  /** 이번 답변 또는 직전 턴들에서 언급된 책 id(최근 것이 앞). 단일 문맥 책 판단에 쓴다. */
  recentBookIds: number[]
}

/**
 * 답변 본문과 문맥으로 빠진 버튼을 채운다. 순수 함수 — 항상 새 배열을 돌려준다.
 */
export function enrichAnswer(answer: AiAnswer, ctx: EnrichContext): AiAnswer {
  const actions: ChatAction[] = [...answer.actions]
  const text = answer.message
  const contextBookId = answer.bookIds[0] ?? ctx.recentBookIds[0]

  // 1) 확인 질문 → 네/아니오 퀵리플라이
  if (CONFIRM_QUESTION_RE.test(text) && !hasReply(actions)) {
    actions.push(...DEFAULT_QUICK_REPLIES)
  }

  // 2) 분야를 물어보는 질문 → 카테고리 칩
  if (CATEGORY_QUESTION_RE.test(text) && !hasReply(actions)) {
    for (const name of CATEGORY_NAMES) {
      actions.push({ type: 'reply', label: name, send: `${name} 분야로 추천해줘` })
    }
  }

  // 3) 책과 묶이는 목적지(리뷰 쓰기 / 상세) — 문맥 책이 있을 때만
  if (contextBookId !== undefined) {
    if (REVIEW_WRITE_RE.test(text)) {
      pushNavigate(actions, '리뷰 쓰러 가기', `/books/${contextBookId}?review=1`)
    }
    if (BOOK_DETAIL_RE.test(text)) {
      pushNavigate(actions, '책 상세 보기', `/books/${contextBookId}`)
    }
  }

  // 4) 페이지 키워드 → 목적지
  for (const rule of PAGE_RULES) {
    if (rule.re.test(text)) pushNavigate(actions, rule.label, rule.to)
  }

  // 5) 버튼을 약속했는데 아직 navigate가 하나도 없으면 문맥 책 상세로라도 이어준다
  if (PROMISES_BUTTON_RE.test(text) && navigateCount(actions) === 0 && contextBookId !== undefined) {
    pushNavigate(actions, '책 상세 보기', `/books/${contextBookId}`)
  }

  return { ...answer, actions }
}

/**
 * 대화 히스토리(assistant 턴은 JSON 문자열일 수 있음)에서 최근 언급된 책 id를 최신순으로 모은다.
 * 클라이언트가 assistant 턴을 `{"message","bookIds","actions"}` JSON으로 되돌려 보내므로
 * 거기서 bookIds를 꺼낸다. 평문 턴은 건너뛴다.
 */
export function recentBookIdsFromHistory(messages: { role: string; content: string }[]): number[] {
  const ids: number[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const trimmed = m.content.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const parsed = JSON.parse(trimmed) as { bookIds?: unknown }
      if (Array.isArray(parsed.bookIds)) {
        for (const id of parsed.bookIds) {
          if (typeof id === 'number' && Number.isFinite(id) && !ids.includes(id)) ids.push(id)
        }
      }
    } catch {
      // JSON이 아닌 assistant 턴은 무시
    }
    if (ids.length >= 5) break
  }
  return ids
}
