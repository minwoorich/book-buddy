// 기존 데이터를 지우지 않고 "위에 더 쌓는" 시드 스크립트. seed.ts/demo-seed.ts와 달리
// resetAll()을 호출하지 않는다 — 실제 팀원이 가입해서 만든 계정·게시물·QA 기록을 보존한
// 채로, 직원 수와 책마다의 리뷰·평점·추천 수만 크게 늘리고 싶을 때 쓴다.
// 실행: npx tsx scripts/enrich-reviews.ts (관리자 리시드 엔드포인트의 mode='enrich-reviews'로도 실행)
import 'dotenv/config'
import { initDb } from '../server/db/connection'
import { generateUniqueNames, randomOrgProfile } from './nameGenerator'
import { pickReviewContent, pickWeightedRating, targetReviewCount } from './reviewContent'

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
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

/** 런타임 SQLite `datetime('now')`와 같은 포맷('YYYY-MM-DD HH:MM:SS', UTC)으로 변환한다. */
function dbTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

const NEW_USER_COUNT = 60

function main(): void {
  const db = initDb() // CREATE TABLE IF NOT EXISTS 뿐이라 기존 데이터는 그대로 둔다.

  console.log('기존 데이터 확인 중...')
  const existingUsers = db.prepare('SELECT id, name FROM users').all() as { id: number; name: string }[]
  const existingNames = new Set(existingUsers.map((u) => u.name))
  const books = db.prepare('SELECT id, category FROM books').all() as { id: number; category: string }[]
  if (books.length === 0) {
    console.error('책이 없어요. 먼저 npm run seed(또는 seed:demo)로 책을 채워주세요.')
    process.exitCode = 1
    return
  }

  console.log(`신규 직원 ${NEW_USER_COUNT}명 생성 중...`)
  const newNames = generateUniqueNames(NEW_USER_COUNT, existingNames)
  const insUser = db.prepare(
    `INSERT INTO users (name, company, department, team, position, gender, birth_year, role, password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'member', '1234')`
  )
  const newUserIds: number[] = []
  for (const name of newNames) {
    const p = randomOrgProfile()
    const result = insUser.run(name, p.company, p.department, p.team, p.position, p.gender, p.birthYear)
    newUserIds.push(Number(result.lastInsertRowid))
  }

  const allUserIds = [...existingUsers.map((u) => u.id), ...newUserIds]

  console.log('책마다 리뷰 채우는 중...')
  const insReview = db.prepare(
    `INSERT INTO reviews (book_id, user_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)`
  )
  // 책별로 이미 리뷰를 남긴 사용자 집합을 미리 로드한다 — 1인 1책 1리뷰 규칙(API의 409 규칙과
  // 동일)을 시드 단계에서도 지키기 위함이다. 이미 존재하는 리뷰(실제 팀원이 남긴 것 포함)도
  // 이 집합에 들어가 중복 후보에서 자연히 제외된다.
  const reviewedRows = db.prepare('SELECT book_id, user_id FROM reviews').all() as {
    book_id: number
    user_id: number
  }[]
  const reviewedByBook = new Map<number, Set<number>>()
  for (const r of reviewedRows) {
    if (!reviewedByBook.has(r.book_id)) reviewedByBook.set(r.book_id, new Set())
    reviewedByBook.get(r.book_id)!.add(r.user_id)
  }

  let reviewCount = 0
  for (const book of shuffle(books)) {
    const already = reviewedByBook.get(book.id) ?? new Set<number>()
    const candidates = shuffle(allUserIds.filter((id) => !already.has(id)))
    const target = Math.min(targetReviewCount(), candidates.length)
    for (let i = 0; i < target; i++) {
      const userId = candidates[i]
      const rating = pickWeightedRating()
      const content = pickReviewContent(book.category, rating)
      const createdAt = dbTimestamp(daysAgo(randomInt(1, 150)))
      insReview.run(book.id, userId, rating, content, createdAt)
      reviewCount++
    }
  }

  console.log('추천(review_votes) 채우는 중...')
  const insVote = db.prepare('INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)')
  const allReviews = db.prepare('SELECT id, user_id FROM reviews').all() as { id: number; user_id: number }[]
  const existingVotes = db.prepare('SELECT review_id, user_id FROM review_votes').all() as {
    review_id: number
    user_id: number
  }[]
  const votedSet = new Set(existingVotes.map((v) => `${v.review_id}:${v.user_id}`))
  const voteTarget = Math.round(allReviews.length * 1.3)
  let voteCount = 0
  let guard = 0
  while (voteCount < voteTarget && guard < voteTarget * 20) {
    guard++
    const review = allReviews[randomInt(0, allReviews.length - 1)]
    const voterId = allUserIds[randomInt(0, allUserIds.length - 1)]
    if (voterId === review.user_id) continue // 자기 리뷰에 스스로 추천을 누르는 건 부자연스럽다.
    const key = `${review.id}:${voterId}`
    if (votedSet.has(key)) continue
    votedSet.add(key)
    insVote.run(review.id, voterId)
    voteCount++
  }

  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
  console.log('\n--- 리뷰 보강 완료 ---')
  console.log(`신규 직원: ${newUserIds.length}명 (전체 users: ${count('users')}명)`)
  console.log(`신규 리뷰: ${reviewCount}건 (전체 reviews: ${count('reviews')}건)`)
  console.log(`신규 추천: ${voteCount}건 (전체 review_votes: ${count('review_votes')}건)`)
}

main()
