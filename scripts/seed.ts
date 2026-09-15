// 데모용 시드 스크립트. 재실행 가능 — 시작 시 전 테이블을 비우고 다시 채운다.
// 실행: npm run seed  (tsx scripts/seed.ts)
// 카카오 책 검색 API 원본 응답을 확인하려면: SEED_DEBUG=1 npm run seed
import 'dotenv/config'
import { initDb, getDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'
import { kakaoBookService } from '../server/services/kakaoBookService'
import { generateUniqueNames, randomOrgProfile } from './nameGenerator'
import { pickReviewContent, pickWeightedRating, targetReviewCount } from './reviewContent'
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 런타임 SQLite `datetime('now')`와 같은 포맷('YYYY-MM-DD HH:MM:SS', UTC)으로 변환한다 —
 * ISO 문자열('...T...Z') 그대로 넣으면 같은 날 데이터끼리 정렬이 인터리브된다. */
function dbTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

const isDebug = () => process.env.SEED_DEBUG === '1'

// 피드 게시물 사진: 책 표지를 썸네일로 쓰면 게시물이 표지 이미지처럼 보이는 문제가 있어(책 태그는
// booktag 칩으로 이미 따로 붙는다), 자체 생성한 단색 SVG data URI 플레이스홀더로 대체한다.
const SEED_PHOTO_COLORS = ['#E8DFD0', '#DCE5DA', '#E3DDE9', '#F0E4D8', '#D9E3EA']

function makeSeedPhoto(bg: string, text: string, sub = 'BOOK BUDDY 인증샷'): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
    `<rect width="400" height="300" fill="${bg}"/>` +
    `<text x="200" y="150" font-family="sans-serif" font-size="22" font-weight="600" fill="#4A4033" text-anchor="middle" dominant-baseline="middle">${text}</text>` +
    `<text x="200" y="270" font-family="sans-serif" font-size="12" letter-spacing="2" fill="#4A4033" opacity="0.6" text-anchor="middle">${sub}</text>` +
    '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ── 1. 기존 데이터 초기화 (FK 역순) ──────────────────────────────────
function resetAll(): void {
  const db = getDb()
  const tablesInDeleteOrder = [
    'qa_feedback',
    'reports',
    'post_comments',
    'post_likes',
    'post_images',
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

// ── 2. 책 (카카오 책 검색, 카테고리별 키워드 검색) ───────────────────
// 카카오 책 검색 API에는 베스트셀러 목록이 없어 카테고리별 대표 키워드로 검색해 수집한다.
// 키워드 하나당 최대 결과가 제한적이라, 카테고리당 목표치(MAX_PER_CATEGORY)를 채우려면
// 키워드를 8~12개로 넉넉히 늘리고 키워드당 여러 페이지(PAGES_PER_KEYWORD)를 조회한다.
const CATEGORIES: { label: string; keywords: string[] }[] = [
  {
    label: '경제경영',
    keywords: ['리더십', '경영 전략', '마케팅', '투자', '조직문화', '협상', '스타트업', '재무', '브랜딩'],
  },
  {
    label: 'IT · 프로그래밍',
    keywords: [
      '프로그래밍',
      '파이썬',
      '자바스크립트',
      '데이터베이스',
      '알고리즘',
      '인공지능',
      '클라우드',
      '소프트웨어 설계',
      '개발자',
    ],
  },
  {
    label: '자기계발',
    keywords: ['습관', '시간관리', '글쓰기', '대화법', '집중력', '커리어', '동기부여', '마인드셋'],
  },
  {
    label: '인문',
    keywords: ['철학', '역사', '심리학', '과학 교양', '에세이', '사회', '경제사', '예술'],
  },
]
// 카테고리당 목표 권수. 총 목표는 CATEGORIES.length * MAX_PER_CATEGORY(현재 4 * 125 = 500).
const MAX_PER_CATEGORY = 125
const PAGE_SIZE = 20
const PAGES_PER_KEYWORD = 2
// 카카오 API 레이트 리밋 배려용 호출 간 대기.
const KAKAO_SLEEP_MS = 100

async function seedBooks(restKey: string): Promise<{ books: Book[]; perCategory: Record<string, number> }> {
  const inserted: Book[] = []
  const seenIsbn = new Set<string>()
  const perCategory: Record<string, number> = {}

  for (const cat of CATEGORIES) {
    console.log(`  - [${cat.label}] 키워드 검색 수집 중... (${cat.keywords.join(', ')})`)
    let categoryCount = 0
    for (const keyword of cat.keywords) {
      if (categoryCount >= MAX_PER_CATEGORY) break
      for (let page = 1; page <= PAGES_PER_KEYWORD; page++) {
        if (categoryCount >= MAX_PER_CATEGORY) break
        const items = await kakaoBookService.search(restKey, keyword, PAGE_SIZE, page)
        await sleep(KAKAO_SLEEP_MS)
        if (isDebug() && items.length > 0) {
          console.log(`[seed] "${keyword}" p${page} raw first item:`, JSON.stringify(items[0], null, 2))
        }
        if (items.length === 0) break // 더 이상 결과가 없으면 다음 페이지를 시도하지 않는다.

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
    perCategory[cat.label] = categoryCount
    console.log(`    → [${cat.label}] ${categoryCount}권 수집`)
  }

  return { books: inserted, perCategory }
}

// ── 3. 직원 12명(design/mockups/v1a/login.html 명단과 동일, 로그인 힌트에 노출) +
//       합성 직원 다수(리뷰 볼륨을 위해 — 로그인은 못 하지만 데이터는 실사용자와 동일) ──
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

// USERS(12명) 외에 추가로 생성할 합성 직원 수 — 책마다 리뷰가 많으려면 리뷰어 풀 자체가
// 커야 한다(1인 1책 1리뷰라 리뷰 수는 결국 "책 수 × 리뷰어 수"에 근접한다).
const EXTRA_USER_COUNT = 55

// 데모용 평문 비밀번호 — 시연 종료와 함께 폐기. 일반 직원은 '1234', 관리자는 'admin1234'.
function seedUsers(): number[] {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO users (name, company, department, team, position, gender, birth_year, role, password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const ids: number[] = []
  for (const u of USERS) {
    const password = u.role === 'admin' ? 'admin1234' : '1234'
    const result = stmt.run(u.name, u.company, u.department, u.team, u.position, u.gender, u.birthYear, u.role, password)
    ids.push(Number(result.lastInsertRowid))
  }

  const extraNames = generateUniqueNames(EXTRA_USER_COUNT, new Set(USERS.map((u) => u.name)))
  for (const name of extraNames) {
    const p = randomOrgProfile()
    const result = stmt.run(name, p.company, p.department, p.team, p.position, p.gender, p.birthYear, 'member', '1234')
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

// ── 6. 책마다 리뷰(1인 1책 1리뷰, 별점 가중 랜덤 + 카테고리별 다양한 문구) + 추천(review_votes) ──
// "책마다 리뷰가 엄청 많이" 달려 있으려면 책 수(500권) 대비 리뷰어 풀이 커야 한다 — 리뷰
// 개수는 결국 "책 수 × 책당 리뷰어 수"에 근접하고, 한 사용자는 같은 책에 두 번 못 쓴다.
function seedReviews(userIds: number[], books: Book[]): { id: number; userId: number }[] {
  const reviews: { id: number; userId: number }[] = []
  for (const book of shuffle(books)) {
    const candidates = shuffle(userIds)
    const target = Math.min(targetReviewCount(), candidates.length)
    for (let i = 0; i < target; i++) {
      const userId = candidates[i]
      const rating = pickWeightedRating()
      const content = pickReviewContent(book.category, rating)
      const createdAt = daysAgo(randomInt(1, 150))
      const result = getDb()
        .prepare(`INSERT INTO reviews (book_id, user_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(book.id, userId, rating, content, dbTimestamp(createdAt))
      reviews.push({ id: Number(result.lastInsertRowid), userId })
    }
  }
  return reviews
}

/** 리뷰 수 대비 약 1.3배의 추천을 무작위로 뿌린다. 자기 리뷰에 스스로 추천은 걸지 않는다. */
function seedReviewVotes(reviews: { id: number; userId: number }[], userIds: number[]): number {
  const used = new Set<string>()
  const target = Math.round(reviews.length * 1.3)
  let count = 0
  let guard = 0
  while (count < target && guard < target * 20) {
    guard++
    const review = pick(reviews)
    const userId = pick(userIds)
    if (userId === review.userId) continue
    const key = `${review.id}:${userId}`
    if (used.has(key)) continue
    used.add(key)
    getDb().prepare(`INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)`).run(review.id, userId)
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

// ── 9. 커뮤니티 피드 3건 (자체 생성 SVG 사진 플레이스홀더, 책은 booktag로만 태그) ─
function seedPosts(userIds: number[], books: Book[]): number {
  const captions = ['오늘 드디어 완독했어요! 📚', '점심시간에 틈틈이 읽고 있습니다.', '표지부터 마음에 들었던 책이에요.']
  const moods = ['점심시간 옥상 독서', '퇴근 후 한 챕터', '주말 카페 독서']
  for (let i = 0; i < captions.length; i++) {
    const userId = pick(userIds)
    const book = pick(books)
    const imagePath = makeSeedPhoto(SEED_PHOTO_COLORS[i % SEED_PHOTO_COLORS.length], moods[i])
    const result = getDb()
      .prepare(`INSERT INTO posts (user_id, book_id, image_path, caption) VALUES (?, ?, ?, ?)`)
      .run(userId, book.id, imagePath, captions[i])
    const postId = Number(result.lastInsertRowid)

    // 첫 게시물은 사진 3장으로 캐러셀 데모가 되게 post_images에 추가로 넣는다.
    if (i === 0) {
      const extraPhotos = [
        imagePath,
        makeSeedPhoto(SEED_PHOTO_COLORS[3], '도시락 먹고 책 한 장'),
        makeSeedPhoto(SEED_PHOTO_COLORS[4], '옥상 벤치에서 한 챕터 더'),
      ]
      const insImage = getDb().prepare(
        `INSERT INTO post_images (post_id, image_path, sort_order) VALUES (?, ?, ?)`
      )
      extraPhotos.forEach((path, sortOrder) => insImage.run(postId, path, sortOrder))
    }
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
  const restKey = process.env.NUXT_KAKAO_REST_KEY
  if (!restKey) {
    console.error(
      'NUXT_KAKAO_REST_KEY가 없습니다. .env 파일에 값을 설정한 뒤 다시 실행해주세요.\n' +
        '발급: https://developers.kakao.com/console/app'
    )
    process.exitCode = 1
    return
  }

  initDb()
  console.log('기존 데이터 초기화 중...')
  resetAll()

  console.log('카카오 책 검색으로 책 시딩 중...')
  const { books, perCategory } = await seedBooks(restKey)
  if (books.length < 3) {
    console.error(
      `카카오 책 검색 API에서 책을 충분히 가져오지 못했어요 (${books.length}권). 키가 유효한지 확인해주세요.`
    )
    process.exitCode = 1
    return
  }

  console.log(`직원 ${USERS.length + EXTRA_USER_COUNT}명 시딩 중...`)
  const userIds = seedUsers()

  console.log('대출 활동 시딩 중...')
  const { completedCount, activeBooks, activeUserIds } = seedLoans(userIds, books)

  console.log('예약 시딩 중...')
  seedReservation(activeBooks, activeUserIds, userIds)

  console.log('책마다 리뷰/추천 시딩 중... (책이 많아 다소 걸릴 수 있어요)')
  const reviews = seedReviews(userIds, books)
  const voteCount = seedReviewVotes(reviews, userIds)

  console.log('찜/구매신청/피드/신고 시딩 중...')
  const wishCount = seedWishlists(userIds, books)
  const purchaseCount = seedPurchaseRequests(userIds)
  const postCount = seedPosts(userIds, books)
  seedReport(userIds, books)

  console.log('\n--- 시드 완료 ---')
  console.log(`books: ${books.length} (목표 ${CATEGORIES.length * MAX_PER_CATEGORY}권)`)
  for (const cat of CATEGORIES) {
    console.log(`  - ${cat.label}: ${perCategory[cat.label] ?? 0}권`)
  }
  console.log(`users: ${userIds.length} (관리자 1명 포함)`)
  console.log(`loans: 완료 ${completedCount} + 진행중 3 (연체 1 포함)`)
  console.log(`reservations: 1`)
  console.log(`reviews: ${reviews.length}, review_votes: ${voteCount}`)
  console.log(`wishlists: ${wishCount}`)
  console.log(`purchase_requests: ${purchaseCount}`)
  console.log(`posts: ${postCount} (1건은 사진 3장 post_images)`)
  console.log(`reports: 1`)
}

main().catch((err) => {
  console.error('시드 실행 중 오류가 발생했습니다:', err)
  process.exitCode = 1
})
