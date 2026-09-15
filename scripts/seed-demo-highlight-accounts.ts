// 시연용으로 지정된 두 실계정(정민우, 전호연)에 "한 달간 여러 책 완독" + "리뷰 30개" 데이터를
// 덧붙이는 1회성 스크립트. enrich-reviews.ts와 달리 새 계정을 만들지 않고, 이미 가입된 두
// 실명 계정에 직접 리뷰·완독 이력을 붙인다 — 시연 요청으로 명시적으로 받은 경우에만 쓴다.
// 기존 데이터는 지우지 않고 위에 더 쌓기만 한다. 실행: npx tsx scripts/seed-demo-highlight-accounts.ts
import { initDb } from '../server/db/connection'
import { pickReviewContent, pickWeightedRating } from './reviewContent'

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

function dbTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

const TARGET_NAMES = ['정민우', '전호연']
const REVIEW_TARGET = 30
const LOAN_TARGET = 16

function main(): void {
  const db = initDb()

  const placeholders = TARGET_NAMES.map(() => '?').join(',')
  const users = db.prepare(`SELECT id, name FROM users WHERE name IN (${placeholders})`).all(...TARGET_NAMES) as {
    id: number
    name: string
  }[]
  if (users.length !== TARGET_NAMES.length) {
    console.error('일부 대상 계정을 찾지 못했습니다:', users.map((u) => u.name))
    process.exitCode = 1
    return
  }

  const allBooks = db.prepare('SELECT id, category FROM books').all() as { id: number; category: string }[]
  if (allBooks.length < REVIEW_TARGET) {
    console.error('책 카탈로그가 부족합니다 (필요:', REVIEW_TARGET, ', 보유:', allBooks.length, ')')
    process.exitCode = 1
    return
  }

  const insLoan = db.prepare(
    `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?)`
  )
  const insReview = db.prepare(
    `INSERT INTO reviews (book_id, user_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)`
  )

  // "오늘"을 고정 앵커로 써서 리뷰·완독 날짜가 미래로 새지 않게 한다.
  const NOW = new Date()

  const txn = db.transaction(() => {
    for (const u of users) {
      const already = new Set(
        (db.prepare('SELECT book_id FROM reviews WHERE user_id = ?').all(u.id) as { book_id: number }[]).map(
          (r) => r.book_id
        )
      )
      if (already.size >= REVIEW_TARGET) {
        console.log(`${u.name}: 이미 리뷰 ${already.size}건 — 건너뜀 (재실행 방지)`)
        continue
      }
      const need = REVIEW_TARGET - already.size
      const pool = shuffle(allBooks.filter((b) => !already.has(b.id)))
      const reviewBooks = pool.slice(0, need)

      for (const b of reviewBooks) {
        const rating = pickWeightedRating()
        const content = pickReviewContent(b.category, rating)
        const createdAt = dbTimestamp(new Date(NOW.getTime() - randomInt(3, 180) * 86_400_000))
        insReview.run(b.id, u.id, rating, content, createdAt)
      }

      // 완독(대출-반납) 이력은 방금 남긴 리뷰의 책 중 일부를 골라, 최근 30일(약 한 달) 안에 흩뿌린다.
      const loanBooks = shuffle(reviewBooks).slice(0, LOAN_TARGET)
      for (const b of loanBooks) {
        const returnedDate = new Date(NOW.getTime() - randomInt(1, 30) * 86_400_000)
        returnedDate.setUTCHours(10, 0, 0, 0)
        const loanedDate = new Date(returnedDate.getTime() - randomInt(4, 9) * 86_400_000)
        const dueDate = new Date(loanedDate.getTime() + 14 * 86_400_000)
        insLoan.run(b.id, u.id, dbTimestamp(loanedDate), dbTimestamp(dueDate), dbTimestamp(returnedDate))
      }

      console.log(`${u.name}(id=${u.id}): 리뷰 +${reviewBooks.length}, 완독 +${loanBooks.length}`)
    }
  })
  txn()

  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
  console.log(
    `총계: users=${count('users')}, books=${count('books')}, reviews=${count('reviews')}, loans=${count('loans')}`
  )
}

main()
