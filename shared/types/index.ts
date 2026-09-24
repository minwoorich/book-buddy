import type { PlaceTagCode } from '../constants/placeTags'

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
  /** 시연용 게스트 계정 — x-guest-token 없이는 인증이 통과하지 않는다. */
  isGuest: boolean
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

/** 리뷰 모아보기 피드 1건 — 작성자·책·추천 수와 이달의 다독왕 순위까지 붙은 형태. */
export interface ReviewCard extends Review {
  userName: string
  department: string
  voteCount: number
  votedByMe: boolean
  bookTitle: string
  bookAuthor: string
  bookCoverUrl: string | null
  /** 이달 반납 권수 기준 다독왕 순위(1~3). 다독왕이 아니면 null. */
  topReaderRank: number | null
}

/** 소속 필터 선택지 1건 — 리뷰를 남긴 사람들의 계열사/부서/팀 조합. */
export interface ReviewOrg {
  company: string
  department: string
  team: string
}

/** GET /api/reviews?scope=all 응답. */
export interface ReviewFeed {
  stats: { count: number; avg: number | null }
  reviews: ReviewCard[]
  /** 소속 드롭다운 선택지 — 고르면 반드시 결과가 있는 조합만 내려온다. */
  orgs: ReviewOrg[]
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
  /** 해시태그(# 없이). 캡션 안의 #태그도 서버가 뽑아 여기에 합쳐 준다. */
  tags: string[]
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

export type ChatAction =
  /** 페이지로 이동하는 버튼. to는 서버 화이트리스트 검증을 거친다. */
  | { type: 'navigate'; label: string; to: string }
  /** 클릭하면 send 텍스트를 사용자 메시지로 바로 전송하는 빠른 답장 버튼(예: 실행 확인 네/아니오). */
  | { type: 'reply'; label: string; send: string }

export interface AiAnswer {
  message: string
  bookIds: number[]
  actions: ChatAction[]
}

/**
 * 책벗이 장소를 추천할 때 근거로 삼은 사내 후기. 모델이 말로만 인용하고 끝나지 않도록
 * 서버가 장소 도구의 결과에서 직접 뽑아 답변에 동봉한다 — 채팅에서 바로 펼쳐 볼 수 있게.
 */
export interface PlaceEvidence {
  name: string
  total: number
  /** 태그 라벨 → 인원 수. 많은 순. */
  tags: Record<string, number>
  /** "이름(부서): 한 줄 후기" 형태. */
  comments: string[]
  mapUrl: string
}

/**
 * 책벗이 이번 답변에서 추천한 장소. 채팅의 "장소 보기" 버튼이 이걸 들고 /places로 넘어가
 * 기준 사업장을 맞추고 추천한 곳만 지도에 찍는다. 모델의 말이 아니라 도구 호출 인자·결과에서
 * 뽑으므로, 지도에 찍히는 핀은 실제로 검색된 장소다.
 */
export interface PlaceRecommendation {
  /** 도구가 실제로 쓴 기준 사업장 키(networks|msys|emx). */
  officeKey: string
  /** 답변이 이름을 부른 장소만. 아무 이름도 안 불렀으면 빈 배열(기준점만 옮긴다). */
  places: Place[]
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

/**
 * 책벗 채팅(POST /api/ai/chat-stream)의 SSE 이벤트.
 *
 * 검색과 달리 done에 장소 근거(places)·추천(recommend)까지 실린다 — 비스트리밍
 * /api/ai/chat 응답과 같은 재료를 그대로 담아, 클라이언트가 텍스트를 먼저 흘려 보여준 뒤
 * 마지막에 책·액션 버튼·후기 근거 UI를 한 번에 붙일 수 있게 한다.
 */
export type AiChatStreamEvent =
  | { type: 'tool'; name: string; detail: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done'
      answer: AiAnswer
      books: Book[]
      places: PlaceEvidence[]
      recommend: PlaceRecommendation | null
    }
  | { type: 'error'; message: string }

export interface RankRow {
  key: string
  label: string
  sub?: string
  count: number
  /** 집계 구간 안에서 count권째를 채운 시각(returned_at). 권수 동률 판정용(QA #93). */
  reachedAt?: string | null
  userId?: number
}

/** GET /api/rankings 응답 — 30분 스냅샷(QA #56)과 집계·다음 갱신 시각. */
export interface RankSnapshot {
  rows: RankRow[]
  updatedAt: string
  nextUpdateAt: string
}

/** 랭킹에서 다른 사람을 눌렀을 때 보여줄 최소 신원 — 전 직원이 보는 화면이라 소속까지만. */
export interface PublicReader {
  id: number
  name: string
  company: string
  department: string
  team: string
  position: string
}

/** 프로필의 완독 책 한 줄 — 책 정보 + 그 사람이 반납한 시각. */
export interface ReaderBook extends Book {
  returnedAt: string
}

/** 프로필의 리뷰 한 줄 — 어떤 책에 남긴 리뷰인지 함께. */
export interface ReaderReview extends Review {
  bookTitle: string
  bookCoverUrl: string | null
}

/** GET /api/users/[id]/profile 응답 — 완독한 책과 남긴 리뷰. */
export interface ReaderProfile {
  user: PublicReader
  doneCount: number
  reviewCount: number
  books: ReaderBook[]
  reviews: ReaderReview[]
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
  /** 카카오 장소 id — 장소 후기의 안정 키. 폴백 예시 장소에는 없다. */
  kakaoId?: string
  /** 카카오맵 장소 상세 페이지(place.map.kakao.com/{id}). */
  placeUrl?: string
}

/** 장소 후기 1건(태그 칩 + 선택적 한 줄). 1인 1후기. */
export interface PlaceReview {
  id: number
  kakaoPlaceId: string
  placeName: string
  userId: number
  userName: string
  department: string
  tags: PlaceTagCode[]
  comment: string
  /** 첨부 사진 경로(`/api/uploads/<name>`) 최대 3장. 없으면 빈 배열. */
  images: string[]
  createdAt: string
  updatedAt: string
}

/** 장소 카드에 보여줄 후기 요약. 목록 화면이 장소 id 묶음으로 한 번에 받는다. */
export interface PlaceReviewSummary {
  kakaoPlaceId: string
  total: number
  /** 태그별 개수. 0인 태그는 키 자체가 없다. */
  tagCounts: Partial<Record<PlaceTagCode, number>>
  /** comment가 비어 있지 않은 최근 2건. */
  recent: Pick<PlaceReview, 'id' | 'userName' | 'department' | 'comment' | 'createdAt'>[]
  /** 카드에 미리 보여줄 최근 사진 최대 3장. */
  photos: string[]
  /** 이 장소에 달린 사진 전체 장수(photos는 그중 일부). */
  photoCount: number
  /** 요청한 사용자의 후기. 없으면 null. */
  mine: Pick<PlaceReview, 'tags' | 'comment' | 'images'> | null
}

/** 후기 시트에서 쓰는 한 장소의 후기 전체. `GET /api/place-reviews/{kakaoId}`. */
export interface PlaceReviewDetail {
  kakaoPlaceId: string
  total: number
  tagCounts: Partial<Record<PlaceTagCode, number>>
  /** 최신순 전체 후기. 내 후기가 있으면 맨 앞에 온다. */
  reviews: PlaceReviewEntry[]
  /** 요청한 사용자의 후기 id. 없으면 null — 목록에서 "내 후기"를 표시하는 데 쓴다. */
  mineId: number | null
}

export type PlaceReviewEntry = Pick<
  PlaceReview,
  'id' | 'userName' | 'department' | 'tags' | 'comment' | 'images' | 'createdAt' | 'updatedAt'
>

/**
 * 사내 후기가 쌓인 장소 1곳의 집계(AI 추천 도구용). 카카오 검색 없이 place_reviews만으로
 * 만들기 때문에 좌표·거리는 없고, 이름은 가장 최근 후기에 적힌 것을 쓴다.
 */
export interface ReviewedPlace {
  kakaoPlaceId: string
  placeName: string
  total: number
  /** 태그별 개수. 0인 태그는 키 자체가 없다. */
  tagCounts: Partial<Record<PlaceTagCode, number>>
  /** 비어 있지 않은 최근 코멘트 최대 2건(최신순). */
  recentComments: string[]
}

/** 공지사항(QA #55). 관리자만 작성·수정·삭제할 수 있고, pinned는 목록 상단 고정. */
export interface Notice {
  id: number
  authorId: number
  authorName: string
  title: string
  content: string
  pinned: boolean
  createdAt: string
  updatedAt: string
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

/** 책모임 상태. 전이 규칙은 설계서 §3 참고. */
export type ClubStatus = 'proposed' | 'inviting' | 'scheduling' | 'confirmed' | 'done' | 'canceled'
export type ClubInviteStatus = 'invited' | 'accepted' | 'declined'
export type ClubMemberRole = 'host' | 'member'

/** 에이전트가 참가자 리뷰를 읽고 만든 토론 질문 한 건과 그 근거. */
export interface ClubAgendaItem {
  question: string
  /** 이 질문이 어느 사람의 리뷰에서 나왔는지. 리뷰가 없어 일반 질문으로 폴백하면 빈 배열. */
  evidence: { userId: number; userName: string; quote: string }[]
}

export interface ClubMember {
  userId: number
  userName: string
  department: string
  company: string
  role: ClubMemberRole
  inviteStatus: ClubInviteStatus
  respondedAt: string | null
}

export interface ClubVote {
  userId: number
  slotIdx: number
}

export interface Club {
  id: number
  bookId: number
  bookTitle: string
  bookCoverUrl: string | null
  status: ClubStatus
  agenda: ClubAgendaItem[]
  matchScore: number
  /** 왜 이 조합인지 — 관리자 승인 화면에 그대로 보여준다. */
  matchReason: string
  /** 항상 시간순 정렬. */
  candidateSlots: string[]
  meetAt: string | null
  inviteExpiresAt: string | null
  voteExpiresAt: string | null
  /** 내부 일정용 장소 확정. 실제 예약이 아니다. */
  place: { kakaoId: string; name: string; lat: number; lng: number } | null
  placeDecidedAt: string | null
  createdAt: string
  canceledReason: string | null
  /** 모임 종료 시각(ISO). 사람 쿨다운의 기준. */
  doneAt: string | null
  /** 시간 투표. slotIdx는 candidateSlots의 인덱스. */
  votes: ClubVote[]
  members: ClubMember[]
}

/** 장소 페이지 배지용 — 곧 열리는 모임이 확정한 장소. `GET /api/clubs/upcoming-places`. */
export interface UpcomingClubPlace {
  clubId: number
  kakaoId: string
  bookTitle: string
  meetAt: string
}

/** 앱 내 알림. DOM의 Notification과 이름이 겹치지 않게 AppNotification으로 둔다. */
export interface AppNotification {
  id: number
  userId: number
  type: string
  title: string
  body: string
  link: string | null
  readAt: string | null
  createdAt: string
}
