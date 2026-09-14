export interface User {
  id: number
  name: string
  company: string
  department: string
  team: string
  position: string
  gender: 'M' | 'F'
  birthYear: number
  role: 'member' | 'admin'
}

export interface Book {
  id: number
  isbn13: string | null
  title: string
  author: string
  publisher: string | null
  category: string
  description: string | null
  coverUrl: string | null
  pubDate: string | null
  pageCount: number | null
}

export type NewBook = Omit<Book, 'id'>

/** 서가 카테고리 4종. `CommonCategoryChips`의 '전체'는 필터 UI 전용이라 제외. */
export const BOOK_CATEGORIES = ['경제경영', 'IT · 프로그래밍', '자기계발', '인문'] as const

/** 외부 서점(카카오 책 검색) 검색 결과 1건. */
export interface ExternalBookItem {
  title: string
  author: string
  publisher: string
  pubDate: string
  description: string
  isbn13: string | null
  cover: string | null
  pageCount: number | null
}

/** GET /api/book-search 응답 1건 — 외부 검색 결과에 사내 보유 여부를 더한 것. */
export interface ExternalBookSearchItem extends ExternalBookItem {
  inLibrary: boolean
  libraryBookId: number | null
}

/** 홈 화면 섹션. 관리자가 노출 여부(enabled)와 순서(sortOrder)를 편집할 수 있다. */
export interface HomeSection {
  id: number
  sectionKey: string
  title: string
  enabled: boolean
  sortOrder: number
}

/** AI 기능(chat/search/places)별 프롬프트·모델 설정. 관리자가 편집할 수 있다. */
export interface AiSetting {
  id: number
  featureKey: string
  systemPrompt: string
  model: string
  maxTokens: number
  temperature: number
  recursionLimit: number | null
  updatedAt: string
}

/** AI 사용량 요약(오늘/누적 호출 수·토큰). */
export interface AiUsageSummary {
  today: { calls: number; inputTokens: number; outputTokens: number }
  total: { calls: number; inputTokens: number; outputTokens: number }
}

/** 최근 AI 호출 1건 — userName은 탈퇴/시드 리셋된 사용자면 null. */
export interface AiUsageRecord {
  id: number
  featureKey: string
  userId: number
  userName: string | null
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  createdAt: string
}

export interface Loan {
  id: number
  bookId: number
  userId: number
  loanedAt: string
  dueAt: string
  returnedAt: string | null
}

export interface Reservation {
  id: number
  bookId: number
  userId: number
  createdAt: string
  status: 'waiting' | 'canceled' | 'fulfilled'
}

export interface Review {
  id: number
  bookId: number
  userId: number
  rating: number
  content: string
  createdAt: string
}

export interface ReviewVote {
  id: number
  reviewId: number
  userId: number
  createdAt: string
}

export interface Wishlist {
  id: number
  userId: number
  bookId: number
  createdAt: string
}

export interface PurchaseRequest {
  id: number
  userId: number
  title: string
  author: string | null
  isbn13: string | null
  coverUrl: string | null
  reason: string | null
  createdAt: string
  status: 'requested' | 'approved' | 'rejected'
}

export interface Post {
  id: number
  userId: number
  bookId: number | null
  imagePath: string
  caption: string | null
  createdAt: string
}

export interface PostComment {
  id: number
  postId: number
  userId: number
  content: string
  createdAt: string
}

export interface Report {
  id: number
  reporterId: number
  targetType: 'book' | 'post' | 'review'
  targetId: number
  reason: string
  status: 'pending' | 'resolved'
  createdAt: string
}

export interface ChatAction {
  type: 'navigate'
  label: string
  to: string
}

export interface AiAnswer {
  message: string
  bookIds: number[]
  actions: ChatAction[]
}

/**
 * `/api/ai/search-stream`(SSE)이 클라이언트로 내려보내는 이벤트 와이어 포맷.
 * tool/delta는 서버 streamAgent가 진행 중 흘려보내고, done/error는 엔드포인트가
 * 스트림 마지막에 한 번만 보낸다.
 */
export type AiSearchStreamEvent =
  | { type: 'tool'; name: string; detail: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; answer: AiAnswer; books: Book[] }
  | { type: 'error'; message: string }

export interface RankRow {
  key: string
  label: string
  sub?: string
  count: number
  userId?: number
}

export interface StatRow {
  label: string
  loanCount: number
  doneCount: number
  headCount: number
  perHead: number
}

/**
 * 카카오 로컬(장소) 검색 결과 1건(책 읽기 좋은 장소). mapx/mapy는 이전 지역 검색 연동 시절부터
 * 써온 WGS84 * 1e7 정수 필드 — 카카오는 x(lng)/y(lat) 문자열만 주므로 lat/lng에 1e7을 곱해
 * 역산해 채운다. lat/lng이 실제 좌표(도 단위)이고, mapx/mapy는 호환을 위해 남겨둔 파생값이다.
 */
export interface Place {
  name: string
  category: string
  address: string
  mapx: number
  mapy: number
  lat: number
  lng: number
  /** 검색 기준 좌표(내 위치)로부터의 거리(미터). 좌표 기반 검색일 때만 채워진다. */
  distanceM?: number
}

/** 팀 QA용 인앱 피드백. path/viewport는 신고 시점에 자동 수집된다. */
export type QaCategory = 'bug' | 'ui' | 'idea' | 'question'
export type QaSeverity = 'blocker' | 'inconvenient' | 'minor'

export interface QaFeedback {
  id: number
  userId: number
  path: string
  viewport: string | null
  /** 한 줄 요약. */
  content: string
  category: QaCategory
  severity: QaSeverity
  /** 재현 순서·기대/실제 결과 등 상세 설명(선택). */
  detail: string | null
  /** 첨부 스크린샷 경로 목록. 해결 처리 시 파일과 함께 비워진다. */
  images: string[]
  status: 'open' | 'resolved'
  createdAt: string
}
