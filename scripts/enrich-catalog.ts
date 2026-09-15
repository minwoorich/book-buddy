// 기존 데이터를 지우지 않고 "위에 더 쌓는" 시드 스크립트(enrich-reviews.ts와 같은 계열).
// 목적: (1) 카카오 책 검색으로 새 책을 더 모으고, (2) 그 책들(+기존에 리뷰가 없던 책)에
// 리뷰·추천을 채우고, (3) 대출-반납 이력을 오래전부터 쌓여온 것처럼 채운다.
// 실행: npx tsx scripts/enrich-catalog.ts (관리자 리시드 엔드포인트의 mode='enrich-catalog'로도 실행)
//
// 리뷰어·대출자는 이 스크립트가 이번 실행에서 새로 만든 합성 인물로만 제한한다 — 실사용자
// 계정(허창훈 등 실제 로그인 테스터)에 그 사람이 하지 않은 리뷰·대출 기록이 붙던 사고
// (커밋 e77fffb)가 다시 나지 않도록, enrich-reviews.ts와 동일한 원칙을 대출에도 적용한다.
import 'dotenv/config'
import { initDb, getDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'
import { kakaoBookService } from '../server/services/kakaoBookService'
import { generateUniqueNames, randomOrgProfile } from './nameGenerator'
import { pickReviewContent, pickWeightedRating, targetReviewCount } from './reviewContent'
import type { Book } from '../shared/types'

const DAY_MS = 86_400_000

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

/** 런타임 SQLite `datetime('now')`와 같은 포맷('YYYY-MM-DD HH:MM:SS', UTC)으로 변환한다. */
function dbTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const isDebug = () => process.env.SEED_DEBUG === '1'

// ── 1. 신규 합성 직원 ──────────────────────────────────────────────
const NEW_USER_COUNT = 60

// ── 2. 책 추가 수집: 기존 4개 카테고리에, seed.ts와 겹치지 않는 새 키워드로 더 모은다.
//    (bookRepo가 쓰는 카테고리 라벨과 정확히 일치해야 reviewContent의 BY_CATEGORY가 매칭된다.) ──
const CATEGORIES_EXTRA: { label: string; keywords: string[] }[] = [
  { label: '경제경영', keywords: ['창업', '세일즈', '인사관리', '회계', '생산성', '비즈니스모델', '고객경험', '전략기획', '디지털전환'] },
  {
    label: 'IT · 프로그래밍',
    keywords: ['리눅스', '네트워크', '정보보안', '웹개발', '모바일앱', '데이터분석', '머신러닝', '디자인패턴', '코딩테스트'],
  },
  { label: '자기계발', keywords: ['독서법', '메모법', '재테크', '자존감', '스트레스관리', '인간관계', '목표설정', '생산성습관'] },
  { label: '인문', keywords: ['고전문학', '인류학', '종교', '미술사', '정치', '언어학', '여행에세이', '건축'] },
]
const MAX_PER_CATEGORY_NEW = 70
const PAGE_SIZE = 20
const PAGES_PER_KEYWORD = 2
const KAKAO_SLEEP_MS = 100

async function collectMoreBooks(restKey: string, existingIsbn: Set<string>): Promise<Book[]> {
  const inserted: Book[] = []
  const seenIsbn = new Set(existingIsbn)

  for (const cat of CATEGORIES_EXTRA) {
    console.log(`  - [${cat.label}] 신규 키워드로 수집 중... (${cat.keywords.join(', ')})`)
    let categoryCount = 0
    for (const keyword of cat.keywords) {
      if (categoryCount >= MAX_PER_CATEGORY_NEW) break
      for (let page = 1; page <= PAGES_PER_KEYWORD; page++) {
        if (categoryCount >= MAX_PER_CATEGORY_NEW) break
        const items = await kakaoBookService.search(restKey, keyword, PAGE_SIZE, page)
        await sleep(KAKAO_SLEEP_MS)
        if (isDebug() && items.length > 0) {
          console.log(`[enrich-catalog] "${keyword}" p${page} raw first item:`, JSON.stringify(items[0], null, 2))
        }
        if (items.length === 0) break

        for (const item of items) {
          if (categoryCount >= MAX_PER_CATEGORY_NEW) break
          if (!item.isbn13 || seenIsbn.has(item.isbn13)) continue
          seenIsbn.add(item.isbn13)
          try {
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
          } catch {
            // UNIQUE 충돌(다른 키워드가 같은 책을 이미 넣은 경우) 등은 건너뛴다.
          }
        }
      }
    }
    console.log(`    → [${cat.label}] ${categoryCount}권 추가`)
  }

  return inserted
}

// ── 3. 리뷰가 아직 없는 책(신규 수집분 + 기존 무리뷰 책)에 리뷰·추천 채우기 ─────────
function fillReviews(
  reviewerPoolIds: number[],
  targetBooks: Book[]
): { reviews: { id: number; userId: number }[]; count: number } {
  const db = getDb()
  const insReview = db.prepare(
    `INSERT INTO reviews (book_id, user_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)`
  )
  const reviews: { id: number; userId: number }[] = []
  const now = Date.now()

  for (const book of shuffle(targetBooks)) {
    const candidates = shuffle(reviewerPoolIds)
    const target = Math.min(targetReviewCount(), candidates.length)
    for (let i = 0; i < target; i++) {
      const userId = candidates[i]
      const rating = pickWeightedRating()
      const content = pickReviewContent(book.category, rating)
      // 리뷰도 대출 이력처럼 최근 몇 주보다 훨씬 오래전부터 조금씩 쌓여온 느낌을 주기 위해
      // 최대 18개월(540일) 전까지 넓게 분산한다(loans와 같은 창).
      const createdAt = now - randomInt(1, 540) * DAY_MS
      const result = insReview.run(book.id, userId, rating, content, dbTimestamp(createdAt))
      reviews.push({ id: Number(result.lastInsertRowid), userId })
    }
  }
  return { reviews, count: reviews.length }
}

function fillReviewVotes(newReviews: { id: number; userId: number }[], voterPoolIds: number[]): number {
  const db = getDb()
  const insVote = db.prepare('INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)')
  const existingVotes = db.prepare('SELECT review_id, user_id FROM review_votes').all() as {
    review_id: number
    user_id: number
  }[]
  const votedSet = new Set(existingVotes.map((v) => `${v.review_id}:${v.user_id}`))

  const target = Math.round(newReviews.length * 1.3)
  let count = 0
  let guard = 0
  while (count < target && newReviews.length > 0 && guard < target * 20) {
    guard++
    const review = pick(newReviews)
    const voterId = pick(voterPoolIds)
    if (voterId === review.userId) continue
    const key = `${review.id}:${voterId}`
    if (votedSet.has(key)) continue
    votedSet.add(key)
    insVote.run(review.id, voterId)
    count++
  }
  return count
}

// ── 4. 대출-반납 이력: "오래전부터 써온" 느낌 ─────────────────────────
// 최근 loans는 이미 있다(최근 ~3개월). 여기서는 한 번도 대출된 적 없는 책(신규 수집분 +
// 기존에 방치돼 있던 책)에, 최대 18개월(540일) 전부터 이어지는 대출-반납 사이클을 채운다.
// 한 책에 두 대출이 동시에 겹치면 안 되므로(현재 서비스가 "책마다 활성 대출 1건"만 허용)
// 책 하나마다 커서를 앞으로만 이동시키며 순차적으로 사이클을 만든다.
const HISTORY_MAX_DAYS = 540 // ~18개월
const HISTORY_MIN_START_DAYS = 60
const ACTIVE_LOAN_PROBABILITY = 0.08 // 이 책 몫의 마지막 사이클을 "지금 대출 중"으로 남길 확률
const LOAN_TARGET = 500

function pickCycleCount(): number {
  const r = Math.random()
  if (r < 0.55) return 1
  if (r < 0.85) return 2
  return 3
}

/** 대출~반납 간격(일). 대부분 마감(14일) 안에 여유 있게 반납하고, 일부는 연체 반납. */
function pickReturnDelayDays(): number {
  const r = Math.random()
  if (r < 0.08) return randomInt(1, 2) // 빠르게 완독
  if (r < 0.65) return randomInt(3, 13) // 마감 안에 여유
  if (r < 0.9) return randomInt(14, 20) // 마감 즈음
  return randomInt(21, 30) // 연체 반납
}

/** 반납 후 같은 책이 다시 대출되기까지의 공백(일) — 계속 손이 가는 책도, 뜸한 책도 있게. */
function pickIdleGapDays(): number {
  return randomInt(10, 150)
}

function insertLoanRaw(bookId: number, userId: number, loanedAtMs: number, dueAtMs: number, returnedAtMs: number | null): void {
  getDb()
    .prepare(`INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?)`)
    .run(bookId, userId, dbTimestamp(loanedAtMs), dbTimestamp(dueAtMs), returnedAtMs === null ? null : dbTimestamp(returnedAtMs))
}

function fillLoanHistory(borrowerPoolIds: number[], untouchedBooks: Book[]): { loans: number; activeLoans: number } {
  const now = Date.now()
  let loans = 0
  let activeLoans = 0

  for (const book of shuffle(untouchedBooks)) {
    if (loans >= LOAN_TARGET) break

    let cursor = now - randomInt(HISTORY_MIN_START_DAYS, HISTORY_MAX_DAYS) * DAY_MS
    const cycles = pickCycleCount()
    const markActiveAtEnd = Math.random() < ACTIVE_LOAN_PROBABILITY
    let lastReturnedAt: number | null = null

    for (let i = 0; i < cycles; i++) {
      if (cursor >= now - 5 * DAY_MS) break // 더 채울 시간 여유가 없다

      const loanedAt = cursor
      const dueAt = loanedAt + 14 * DAY_MS
      const borrowerId = pick(borrowerPoolIds)
      const delay = pickReturnDelayDays() * DAY_MS
      const returnedAt = Math.min(loanedAt + delay, now - DAY_MS)

      insertLoanRaw(book.id, borrowerId, loanedAt, dueAt, returnedAt)
      loans++
      lastReturnedAt = returnedAt
      cursor = returnedAt + pickIdleGapDays() * DAY_MS
    }

    // 이 책의 마지막 사이클을 "지금 대출 중"으로 남긴다 — 최근 3~25일 사이에 대출된 것으로,
    // 직전 반납 이후여야 하고(겹침 방지), 대출 목표(LOAN_TARGET)에도 포함시킨다.
    if (markActiveAtEnd && loans < LOAN_TARGET) {
      const activeLoanedAt = now - randomInt(3, 25) * DAY_MS
      if (lastReturnedAt === null || activeLoanedAt > lastReturnedAt) {
        insertLoanRaw(book.id, pick(borrowerPoolIds), activeLoanedAt, activeLoanedAt + 14 * DAY_MS, null)
        loans++
        activeLoans++
      }
    }
  }

  return { loans, activeLoans }
}

// ── 실행 ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const restKey = process.env.NUXT_KAKAO_REST_KEY
  if (!restKey) {
    console.error('NUXT_KAKAO_REST_KEY가 없어요 — 새 책 수집을 하려면 카카오 REST 키가 필요해요.')
    process.exitCode = 1
    return
  }

  const db = initDb() // CREATE TABLE IF NOT EXISTS 뿐이라 기존 데이터는 그대로 둔다.

  console.log('기존 데이터 확인 중...')
  const existingUsers = db.prepare('SELECT id, name FROM users').all() as { id: number; name: string }[]
  const existingNames = new Set(existingUsers.map((u) => u.name))
  const existingIsbn = new Set(
    (db.prepare('SELECT isbn13 FROM books WHERE isbn13 IS NOT NULL').all() as { isbn13: string }[]).map(
      (r) => r.isbn13
    )
  )
  const beforeCounts = {
    users: existingUsers.length,
    books: (db.prepare('SELECT COUNT(*) c FROM books').get() as { c: number }).c,
    reviews: (db.prepare('SELECT COUNT(*) c FROM reviews').get() as { c: number }).c,
    votes: (db.prepare('SELECT COUNT(*) c FROM review_votes').get() as { c: number }).c,
    loans: (db.prepare('SELECT COUNT(*) c FROM loans').get() as { c: number }).c,
  }

  console.log(`신규 직원 ${NEW_USER_COUNT}명 생성 중...`)
  const newNames = generateUniqueNames(NEW_USER_COUNT, existingNames)
  const insUser = db.prepare(
    `INSERT INTO users (name, company, department, team, position, gender, birth_year, role) VALUES (?, ?, ?, ?, ?, ?, ?, 'member')`
  )
  const newUserIds: number[] = []
  for (const name of newNames) {
    const p = randomOrgProfile()
    const result = insUser.run(name, p.company, p.department, p.team, p.position, p.gender, p.birthYear)
    newUserIds.push(Number(result.lastInsertRowid))
  }
  // 리뷰·대출은 이번에 새로 만든 합성 인물로만 제한한다(실사용자 계정 오염 방지, 상단 설명 참고).
  const syntheticPoolIds = newUserIds

  console.log('카카오 책 검색으로 새 책 수집 중...')
  const newBooks = await collectMoreBooks(restKey, existingIsbn)
  console.log(`  → 총 ${newBooks.length}권 신규 수집`)

  console.log('리뷰 없는 책에 리뷰 채우는 중...')
  const zeroReviewBooks = (
    db
      .prepare(
        `SELECT b.* FROM books b WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.book_id = b.id)`
      )
      .all() as {
      id: number
      isbn13: string | null
      title: string
      author: string
      publisher: string | null
      category: string
      description: string | null
      cover_url: string | null
      pub_date: string | null
      page_count: number | null
    }[]
  ).map((row) => ({
    id: row.id,
    isbn13: row.isbn13,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    category: row.category,
    description: row.description,
    coverUrl: row.cover_url,
    pubDate: row.pub_date,
    pageCount: row.page_count,
  }))
  const { reviews: newReviews, count: reviewCount } = fillReviews(syntheticPoolIds, zeroReviewBooks)

  console.log('추천(review_votes) 채우는 중...')
  const voteCount = fillReviewVotes(newReviews, syntheticPoolIds)

  console.log('대출-반납 이력 채우는 중(최대 18개월 전부터)...')
  const untouchedBooks = (
    db
      .prepare(`SELECT b.* FROM books b WHERE NOT EXISTS (SELECT 1 FROM loans l WHERE l.book_id = b.id)`)
      .all() as typeof zeroReviewBooks
  ).map((row) => ({
    id: row.id,
    isbn13: row.isbn13,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    category: row.category,
    description: row.description,
    coverUrl: row.cover_url,
    pubDate: row.pub_date,
    pageCount: row.page_count,
  }))
  const { loans: loanCount, activeLoans } = fillLoanHistory(syntheticPoolIds, untouchedBooks)

  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
  console.log('\n--- 카탈로그·이력 보강 완료 ---')
  console.log(`신규 직원: ${newUserIds.length}명 (전체 users: ${count('users')}명, 이전 ${beforeCounts.users}명)`)
  console.log(`신규 책: ${newBooks.length}권 (전체 books: ${count('books')}권, 이전 ${beforeCounts.books}권)`)
  console.log(`신규 리뷰: ${reviewCount}건 (전체 reviews: ${count('reviews')}건, 이전 ${beforeCounts.reviews}건)`)
  console.log(`신규 추천: ${voteCount}건 (전체 review_votes: ${count('review_votes')}건, 이전 ${beforeCounts.votes}건)`)
  console.log(
    `신규 대출(대출중 ${activeLoans}건 포함): ${loanCount}건 (전체 loans: ${count('loans')}건, 이전 ${beforeCounts.loans}건)`
  )
}

main()
