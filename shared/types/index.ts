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
}

/** 팀 QA용 인앱 피드백. path/viewport는 신고 시점에 자동 수집된다. */
export interface QaFeedback {
  id: number
  userId: number
  path: string
  viewport: string | null
  content: string
  status: 'open' | 'resolved'
  createdAt: string
}
