// 데모용 시드 스크립트. 재실행 가능 — 시작 시 전 테이블을 비우고 다시 채운다.
// 실행: npm run seed  (tsx scripts/seed.ts)
// 네이버 책 검색 API 원본 응답을 확인하려면: SEED_DEBUG=1 npm run seed
import 'dotenv/config'
import { initDb, getDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'
import { naverBookService } from '../server/services/naverBookService'
import type { Book } from '../shared/types'

// ── 유틸 ─────────────────────────────────────────────────────────────
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}

/** 런타임 SQLite `datetime('now')`와 같은 포맷('YYYY-MM-DD HH:MM:SS', UTC)으로 변환한다 —
 * ISO 문자열('...T...Z') 그대로 넣으면 같은 날 데이터끼리 정렬이 인터리브된다. */
function dbTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

const isDebug = () => process.env.SEED_DEBUG === '1'

// via.placeholder.com이 서비스 종료돼(2023년) 외부 요청 없이 항상 뜨는 단색 SVG data URI로 대체.
const FALLBACK_COVER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360">' +
  '<rect width="240" height="360" fill="#C9BCA2"/>' +
  '<text x="120" y="180" font-family="sans-serif" font-size="20" fill="#4A4033" text-anchor="middle" dominant-baseline="middle">Book Buddy</text>' +
  '</svg>'
const FALLBACK_COVER = `data:image/svg+xml,${encodeURIComponent(FALLBACK_COVER_SVG)}`

// ── 1. 기존 데이터 초기화 (FK 역순) ──────────────────────────────────
function resetAll(): void {
  const db = getDb()
  const tablesInDeleteOrder = [
    'reports',
    'post_comments',
    'post_likes',
    'posts',
    'purchase_requests',
    'wishlists',
    'review_votes',
    'reviews',
    'reservations',
    'loans',
    'books',
    'users',
  ]
  for (const table of tablesInDeleteOrder) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
}

// ── 2. 책 (네이버 책 검색, 카테고리별 키워드 검색) ───────────────────
// 네이버 책 검색 API에는 베스트셀러 목록이 없어 카테고리별 대표 키워드로 검색해 수집한다.
const CATEGORIES: { label: string; keywords: string[] }[] = [
  { label: '경제경영', keywords: ['리더십', '경영 전략', '마케팅'] },
  { label: 'IT · 프로그래밍', keywords: ['프로그래밍', '소프트웨어 개발', '클린 코드'] },
  { label: '자기계발', keywords: ['습관', '자기계발 베스트'] },
  { label: '인문', keywords: ['철학 입문', '세계사'] },
]
const MAX_PER_CATEGORY = 10

async function seedBooks(clientId: string, clientSecret: string): Promise<Book[]> {
  const inserted: Book[] = []
  const seenIsbn = new Set<string>()

  for (const cat of CATEGORIES) {
    console.log(`  - [${cat.label}] 키워드 검색 수집 중... (${cat.keywords.join(', ')})`)
    let categoryCount = 0
    for (const keyword of cat.keywords) {
      if (categoryCount >= MAX_PER_CATEGORY) break
      const display = randomInt(5, 6)
      const items = await naverBookService.search(clientId, clientSecret, keyword, display)
      if (isDebug() && items.length > 0) {
        console.log(`[seed] "${keyword}" raw first item:`, JSON.stringify(items[0], null, 2))
      }
      for (const item of items) {
        if (categoryCount >= MAX_PER_CATEGORY) break
        if (!item.isbn13 || seenIsbn.has(item.isbn13)) continue
        seenIsbn.add(item.isbn13)
        const id = bookRepo.insert({
          isbn13: item.isbn13,
          title: item.title,
          author: item.author,
          publisher: item.publisher || null,
          category: cat.label,
          description: item.description || null,
          coverUrl: item.cover,
          pubDate: item.pubDate || null,
          pageCount: null,
        })
        const book = bookRepo.findById(id)
        if (book) {
          inserted.push(book)
          categoryCount++
        }
      }
    }
  }
  return inserted
}

// ── 3. 직원 12명 (design/mockups/v1a/login.html 명단과 동일) ─────────
interface SeedUser {
  name: string
  company: string
  department: string
  team: string
  position: string
  gender: 'M' | 'F'
  birthYear: number
  role: 'member' | 'admin'
}

const USERS: SeedUser[] = [
  { name: '김민우', company: '바텍', department: '개발본부', team: 'SW개발팀', position: '사원', gender: 'M', birthYear: 1996, role: 'member' },
  { name: '이서연', company: '바텍', department: '마케팅본부', team: '마케팅팀', position: '대리', gender: 'F', birthYear: 1992, role: 'member' },
  { name: '박지훈', company: '레이언스', department: '연구소', team: '연구1팀', position: '책임', gender: 'M', birthYear: 1985, role: 'member' },
  { name: '최은지', company: '바텍', department: '경영지원본부', team: '인사팀', position: '과장', gender: 'F', birthYear: 1988, role: 'member' },
  { name: '정다은', company: '바텍네트웍스', department: '영업본부', team: '영업팀', position: '사원', gender: 'F', birthYear: 1997, role: 'member' },
  { name: '한상우', company: '바텍', department: '개발본부', team: 'SW개발팀', position: '팀장', gender: 'M', birthYear: 1980, role: 'member' },
  { name: '오유진', company: '레이언스', department: '품질본부', team: '품질팀', position: '대리', gender: 'F', birthYear: 1991, role: 'member' },
  { name: '강태호', company: '바텍', department: '경영지원본부', team: '재무팀', position: '차장', gender: 'M', birthYear: 1975, role: 'member' },
  { name: '윤소라', company: '바텍네트웍스', department: '영업본부', team: 'CS팀', position: '사원', gender: 'F', birthYear: 1998, role: 'member' },
  { name: '임준영', company: '바텍', department: '연구소', team: '연구2팀', position: '수석', gender: 'M', birthYear: 1972, role: 'member' },
  { name: '서지민', company: '레이언스', department: '기획본부', team: '기획팀', position: '대리', gender: 'F', birthYear: 1990, role: 'member' },
  { name: '도서관리자', company: '바텍', department: '경영지원본부', team: '총무팀', position: '사서', gender: 'F', birthYear: 1978, role: 'admin' },
]

function seedUsers(): number[] {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const ids: number[] = []
  for (const u of USERS) {
    const result = stmt.run(u.name, u.company, u.department, u.team, u.position, u.gender, u.birthYear, u.role)
    ids.push(Number(result.lastInsertRowid))
  }
  return ids
}

// ── 4. 대출 활동 (raw SQL, 과거 날짜 분산) ───────────────────────────
function insertLoanRaw(bookId: number, userId: number, loanedAt: Date, dueAt: Date, returnedAt: Date | null): number {
  const result = getDb()
    .prepare(
      `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(bookId, userId, dbTimestamp(loanedAt), dbTimestamp(dueAt), returnedAt ? dbTimestamp(returnedAt) : null)
  return Number(result.lastInsertRowid)
}

/**
 * 반납 완료 대출을 최근 3개월(약 90일)에 분산해서 넣고(랭킹·달력용),
 * 이어서 진행 중인 대출 3건(그중 1건은 연체)을 넣는다.
 */
function seedLoans(
  userIds: number[],
  books: Book[]
): { completedCount: number; activeBooks: Book[]; activeUserIds: number[] } {
  const COMPLETED_COUNT = 28
  for (let i = 0; i < COMPLETED_COUNT; i++) {
    const book = pick(books)
    const userId = pick(userIds)
    const returnedAt = daysAgo(randomInt(1, 88))
    const loanedAt = new Date(returnedAt.getTime() - randomInt(3, 13) * 86_400_000)
    const dueAt = new Date(loanedAt.getTime() + 14 * 86_400_000)
    insertLoanRaw(book.id, userId, loanedAt, dueAt, returnedAt)
  }

  // 진행 중 대출 3건: 서로 다른 책 3권, 그중 1건은 연체(대출 20일 전 → 마감 6일 전)
  const activeBooks = shuffle(books).slice(0, 3)
  const activeUserIds = shuffle(userIds).slice(0, 3)

  const overdueLoanedAt = daysAgo(20)
  insertLoanRaw(activeBooks[0].id, activeUserIds[0], overdueLoanedAt, new Date(overdueLoanedAt.getTime() + 14 * 86_400_000), null)

  const loanedAt2 = daysAgo(3)
  insertLoanRaw(activeBooks[1].id, activeUserIds[1], loanedAt2, new Date(loanedAt2.getTime() + 14 * 86_400_000), null)

  const loanedAt3 = daysAgo(7)
  insertLoanRaw(activeBooks[2].id, activeUserIds[2], loanedAt3, new Date(loanedAt3.getTime() + 14 * 86_400_000), null)

  return { completedCount: COMPLETED_COUNT, activeBooks, activeUserIds }
}

// ── 5. 예약 1건 (대출 중인 책, 대출자 본인이 아닌 다른 직원) ─────────
function seedReservation(activeBooks: Book[], activeUserIds: number[], allUserIds: number[]): void {
  const book = activeBooks[1]
  const borrowerId = activeUserIds[1]
  const reserverId = allUserIds.find((id) => id !== borrowerId) ?? allUserIds[0]
  getDb()
    .prepare(`INSERT INTO reservations (book_id, user_id, status) VALUES (?, ?, 'waiting')`)
    .run(book.id, reserverId)
}

// ── 6. 리뷰 12건 + 추천(review_votes) ────────────────────────────────
const REVIEW_CONTENTS = [
  '팀 운영에 바로 적용할 수 있는 조언이 많아서 좋았어요.',
  '생각보다 술술 읽혀서 이틀 만에 다 읽었습니다.',
  '사례가 풍부해서 실무에 도움이 많이 됐어요.',
  '초반은 다소 이론적이지만 후반부가 알찹니다.',
  '동료들에게도 추천하고 싶은 책이에요.',
  '내용은 좋은데 번역이 조금 아쉬웠어요.',
  '입문서로 딱 좋은 난이도였습니다.',
  '읽고 나서 업무 방식을 다시 돌아보게 됐어요.',
  '예시가 다소 오래된 느낌이 있지만 핵심은 여전히 유효해요.',
  '한 줄 한 줄 밑줄 그으면서 읽었습니다.',
  '가볍게 읽기 좋은데 인사이트는 묵직해요.',
  '신입 때 읽었으면 더 좋았을 책이네요.',
]

function seedReviews(userIds: number[], books: Book[]): number[] {
  const ids: number[] = []
  for (let i = 0; i < REVIEW_CONTENTS.length; i++) {
    const book = pick(books)
    const userId = pick(userIds)
    const rating = randomInt(3, 5)
    const createdAt = daysAgo(randomInt(1, 80))
    const result = getDb()
      .prepare(`INSERT INTO reviews (book_id, user_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(book.id, userId, rating, REVIEW_CONTENTS[i], dbTimestamp(createdAt))
    ids.push(Number(result.lastInsertRowid))
  }
  return ids
}

function seedReviewVotes(reviewIds: number[], userIds: number[]): number {
  const used = new Set<string>()
  const TARGET = 10
  let count = 0
  let guard = 0
  while (count < TARGET && guard < 500) {
    guard++
    const reviewId = pick(reviewIds)
    const userId = pick(userIds)
    const key = `${reviewId}:${userId}`
    if (used.has(key)) continue
    used.add(key)
    getDb().prepare(`INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)`).run(reviewId, userId)
    count++
  }
  return count
}

// ── 7. 찜 4건 ────────────────────────────────────────────────────────
function seedWishlists(userIds: number[], books: Book[]): number {
  const used = new Set<string>()
  const TARGET = 4
  let count = 0
  let guard = 0
  while (count < TARGET && guard < 200) {
    guard++
    const userId = pick(userIds)
    const book = pick(books)
    const key = `${userId}:${book.id}`
    if (used.has(key)) continue
    used.add(key)
    getDb().prepare(`INSERT INTO wishlists (user_id, book_id) VALUES (?, ?)`).run(userId, book.id)
    count++
  }
  return count
}

// ── 8. 구매신청 2건 ──────────────────────────────────────────────────
function seedPurchaseRequests(userIds: number[]): number {
  const requests = [
    { title: '디자인 스프린트', author: '제이크 냅', isbn13: null, coverUrl: null, reason: '팀 워크숍 참고 자료로 신청합니다.' },
    { title: '노이즈: 생각의 잡음', author: '대니얼 카너먼 외', isbn13: null, coverUrl: null, reason: '의사결정 스터디 도서로 희망합니다.' },
  ]
  for (const r of requests) {
    const userId = pick(userIds)
    getDb()
      .prepare(
        `INSERT INTO purchase_requests (user_id, title, author, isbn13, cover_url, reason) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(userId, r.title, r.author, r.isbn13, r.coverUrl, r.reason)
  }
  return requests.length
}

// ── 9. 커뮤니티 피드 3건 (표지 URL을 image_path로) ──────────────────
function seedPosts(userIds: number[], books: Book[]): number {
  const captions = ['오늘 드디어 완독했어요! 📚', '점심시간에 틈틈이 읽고 있습니다.', '표지부터 마음에 들었던 책이에요.']
  for (let i = 0; i < captions.length; i++) {
    const userId = pick(userIds)
    const book = pick(books)
    getDb()
      .prepare(`INSERT INTO posts (user_id, book_id, image_path, caption) VALUES (?, ?, ?, ?)`)
      .run(userId, book.id, book.coverUrl ?? FALLBACK_COVER, captions[i])
  }
  return captions.length
}

// ── 10. 신고 1건 ─────────────────────────────────────────────────────
function seedReport(userIds: number[], books: Book[]): void {
  const reporterId = pick(userIds)
  const book = pick(books)
  getDb()
    .prepare(`INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, 'book', ?, ?)`)
    .run(reporterId, book.id, '표지가 파손되어 있어요.')
}

// ── main ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const clientId = process.env.NUXT_NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NUXT_NAVER_SEARCH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error(
      'NUXT_NAVER_SEARCH_CLIENT_ID / NUXT_NAVER_SEARCH_CLIENT_SECRET이 없습니다. .env 파일에 값을 설정한 뒤 다시 실행해주세요.\n' +
        '발급: https://developers.naver.com/apps/#/register'
    )
    process.exitCode = 1
    return
  }

  initDb()
  console.log('기존 데이터 초기화 중...')
  resetAll()

  console.log('네이버 책 검색으로 책 시딩 중...')
  const books = await seedBooks(clientId, clientSecret)
  if (books.length < 3) {
    console.error(
      `네이버 책 검색 API에서 책을 충분히 가져오지 못했어요 (${books.length}권). 키가 유효한지 확인해주세요.`
    )
    process.exitCode = 1
    return
  }

  console.log('직원 12명 시딩 중...')
  const userIds = seedUsers()

  console.log('대출 활동 시딩 중...')
  const { completedCount, activeBooks, activeUserIds } = seedLoans(userIds, books)

  console.log('예약 시딩 중...')
  seedReservation(activeBooks, activeUserIds, userIds)

  console.log('리뷰/추천 시딩 중...')
  const reviewIds = seedReviews(userIds, books)
  const voteCount = seedReviewVotes(reviewIds, userIds)

  console.log('찜/구매신청/피드/신고 시딩 중...')
  const wishCount = seedWishlists(userIds, books)
  const purchaseCount = seedPurchaseRequests(userIds)
  const postCount = seedPosts(userIds, books)
  seedReport(userIds, books)

  console.log('\n--- 시드 완료 ---')
  console.log(`books: ${books.length}`)
  console.log(`users: ${userIds.length} (관리자 1명 포함)`)
  console.log(`loans: 완료 ${completedCount} + 진행중 3 (연체 1 포함)`)
  console.log(`reservations: 1`)
  console.log(`reviews: ${reviewIds.length}, review_votes: ${voteCount}`)
  console.log(`wishlists: ${wishCount}`)
  console.log(`purchase_requests: ${purchaseCount}`)
  console.log(`posts: ${postCount}`)
  console.log(`reports: 1`)
}

main().catch((err) => {
  console.error('시드 실행 중 오류가 발생했습니다:', err)
  process.exitCode = 1
})
