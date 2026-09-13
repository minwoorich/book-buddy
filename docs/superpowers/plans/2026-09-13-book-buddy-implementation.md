# Book Buddy 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사내 AI 도서시스템 데모 — 대출/반납/예약/구매신청 + LangChain 기반 AI 사서 챗봇 + 검색/추천 + 책장/달력/랭킹/피드/장소/관리자.

**Architecture:** Nuxt 3 단일 앱. 서버는 `api(Nitro 파일 라우팅) → services → repositories → db(SQLite)` 단방향 레이어. AI는 LangGraph ReAct 에이전트(도구 = service 재사용)가 `/api/ai/*` RPC 엔드포인트 뒤에 위치. 프론트는 `design/mockups/v1a/`의 확정 목업을 Vue 컴포넌트로 포팅.

**Tech Stack:** Nuxt 3, TypeScript, better-sqlite3, `@langchain/anthropic` + `@langchain/core` + `@langchain/langgraph`, zod, Vitest.

## Global Constraints

- **전부 TypeScript.** 순수 `.js` 파일 금지. Vue는 `<script setup lang="ts">`.
- **레이어 단방향 의존**: `api → services → repositories → db`. api에서 db 직접 접근 금지. AI tools는 services/repositories만 호출.
- **1테이블 1레포지토리 파일, 1도구 1파일, 1엔드포인트 1파일** (Nitro 파일 라우팅: `books/index.get.ts`, `books/[id].get.ts`).
- **RESTful**: 자원 중심 URL + 표준 메서드. 사용자 식별은 `x-user-id` 헤더 (데모 수준).
- **VATECH red `#E60012`는 포인트 전용** (버튼/액티브/로고/AI 라벨). 배경·본문은 뉴트럴. 디자인 기준은 `design/mockups/v1a/` (스타일 토큰: `style.css`).
- **랭킹·책쌓기·통계·달력은 전부 대출-반납 기록(반납 완료 권수) 기준.** 페이지 진행률 개념 없음.
- **챗봇(FAB·위젯)은 로그인 상태에서만 렌더링.**
- **자동화 테스트는 loanService 규칙만** (Vitest). 나머지는 각 태스크의 curl/브라우저 수동 검증 단계로 확인 (1일 데모 — 설계서 9절).
- 대출 규칙: 책당 재고 1권, 기한 14일, 대출 중인 책만 예약 가능, 본인 대출 책 예약 불가, 중복 예약 불가, 반납된 책에 대기 예약이 있으면 예약 1순위만 대출 가능(타인 409), 1순위 대출 시 예약 fulfilled.
- 에러 규약: 규칙 위반 409 + 한국어 메시지, 인증 없음 401, 권한 없음 403, 없는 자원 404. AI 실패 시 다른 기능은 정상 동작.
- 환경변수: `ANTHROPIC_API_KEY`, `ALADIN_TTB_KEY`, `NAVER_MAP_CLIENT_ID`, `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`. 코드에 하드코딩 금지.
- 커밋 메시지는 conventional commits(`feat:`, `test:`, `chore:` …) + 말미에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **우선순위(시간 부족 시 아래쪽부터 잘라냄)**: Task 1~10(코어+AI) > 11~14(핵심 화면) > 15~17(책장/달력/랭킹) > 18~21(피드/장소/관리자) > 22(배포).

---

## 파일 구조 (전체 조감)

```
shared/types/index.ts        # 도메인 타입 전부 (User, Book, Loan, ...)
server/db/connection.ts      # getDb() 싱글턴, initDb(path) (테스트용 :memory: 지원)
server/db/migrate.ts         # CREATE TABLE 전부 (idempotent)
server/repositories/*.ts     # userRepo, bookRepo, loanRepo, reservationRepo,
                             # purchaseRequestRepo, reviewRepo, reviewVoteRepo,
                             # wishlistRepo, postRepo, postLikeRepo, postCommentRepo, reportRepo
server/services/loanService.ts        # 대출/반납/예약 규칙 (Vitest 대상)
server/services/rankingService.ts     # 랭킹 집계
server/services/statsService.ts       # 그룹별 통계
server/services/aladinService.ts      # 알라딘 API 클라이언트
server/services/naverPlaceService.ts  # 네이버 지역검색 클라이언트
server/services/uploadService.ts      # 사진 저장/서빙
server/utils/api.ts          # requireUser, requireAdmin, ApiError→createError 변환
server/ai/agent.ts, prompts.ts, parse.ts, tools/*.ts (10개)
server/api/**                # 엔드포인트 (태스크별 명시)
app/assets/css/main.css      # v1a 스타일 토큰+공용 컴포넌트 CSS (목업 style.css 포팅)
app/composables/useCurrentUser.ts, useApi.ts, useChat.ts
app/components/{common,book,ai,review,reading,feed,admin}/*.vue
app/pages/{login,index,books/[id],my,calendar,rankings,feed,places,admin/index,admin/stats}.vue
app/middleware/auth.global.ts
scripts/seed.ts
tests/loanService.test.ts
```

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: Nuxt 프로젝트 루트 (`nuxt.config.ts`, `package.json`, `tsconfig.json`, `app.vue`), `.env.example`, `vitest.config.ts`

**Interfaces:**
- Produces: `npm run dev`(포트 3000), `npm run seed`, `npx vitest run` 동작하는 빈 프로젝트

- [ ] **Step 1: Nuxt 3 생성 + 의존성 설치**

```bash
npx nuxi@latest init . --packageManager npm --gitInit false   # 기존 파일 충돌 시 임시 폴더에 생성 후 파일 복사
npm i better-sqlite3 @langchain/anthropic @langchain/core @langchain/langgraph zod
npm i -D @types/better-sqlite3 vitest tsx
```

- [ ] **Step 2: nuxt.config.ts / package.json scripts / .env.example 작성**

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-09-13',
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Book Buddy',
      link: [
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&display=swap' },
      ],
    },
  },
  runtimeConfig: {
    anthropicApiKey: '', aladinTtbKey: '',
    naverSearchClientId: '', naverSearchClientSecret: '',
    public: { naverMapClientId: '' },
  },
})
```

`runtimeConfig`는 `NUXT_ANTHROPIC_API_KEY` 형식의 env로 채워진다 → `.env.example`:

```
NUXT_ANTHROPIC_API_KEY=
NUXT_ALADIN_TTB_KEY=
NUXT_NAVER_SEARCH_CLIENT_ID=
NUXT_NAVER_SEARCH_CLIENT_SECRET=
NUXT_PUBLIC_NAVER_MAP_CLIENT_ID=
```

package.json scripts에 추가: `"seed": "tsx scripts/seed.ts"`, `"test": "vitest run"`.
`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } })
```

임시 `tests/smoke.test.ts`: `import { it, expect } from 'vitest'; it('smoke', () => expect(1).toBe(1))`
`app.vue`는 `<template><NuxtPage /></template>` 만.

- [ ] **Step 3: 검증** — `npm run dev` 부팅 확인(3000), `npx vitest run` PASS, `.gitignore`에 `.data/` 추가.
- [ ] **Step 4: Commit** — `chore: Nuxt 3 + TypeScript 스캐폴딩`

---

### Task 2: 도메인 타입 + DB 커넥션/스키마 + 기본 레포지토리

**Files:**
- Create: `shared/types/index.ts`, `server/db/connection.ts`, `server/db/migrate.ts`, `server/repositories/{userRepo,bookRepo}.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `initDb(path?: string): Database` / `getDb(): Database` (connection.ts)
  - `migrate(db: Database): void`
  - `userRepo.findAll(): User[]`, `userRepo.findById(id: number): User | undefined`
  - `bookRepo.findAll(q?: { query?: string; category?: string }): Book[]`, `bookRepo.findById(id): Book | undefined`, `bookRepo.insert(b: NewBook): number`, `bookRepo.remove(id): void`, `bookRepo.categories(): string[]`
  - 타입: `User { id, name, company, department, team, position, gender: 'M'|'F', birthYear, role: 'member'|'admin' }`, `Book { id, isbn13, title, author, publisher, category, description, coverUrl, pubDate, pageCount }`, `Loan { id, bookId, userId, loanedAt, dueAt, returnedAt: string|null }`, `Reservation { id, bookId, userId, createdAt, status: 'waiting'|'canceled'|'fulfilled' }`, `Review`, `ReviewVote`, `Wishlist`, `PurchaseRequest { status: 'requested'|'approved'|'rejected' }`, `Post`, `PostComment`, `Report { targetType: 'book'|'post'|'review', status: 'pending'|'resolved' }`, `ChatAction { type: 'navigate'; label: string; to: string }`, `AiAnswer { message: string; bookIds: number[]; actions: ChatAction[] }`

- [ ] **Step 1: 타입 정의** — 위 Produces의 타입을 `shared/types/index.ts`에 전부 작성 (DB는 snake_case, TS는 camelCase — 레포지토리에서 매핑).
- [ ] **Step 2: connection.ts + migrate.ts**

```ts
// server/db/connection.ts
import Database from 'better-sqlite3'
import { migrate } from './migrate'
let db: Database.Database | null = null
export function initDb(path = '.data/bookbuddy.sqlite') {
  if (path !== ':memory:') { const { mkdirSync } = require('node:fs'); mkdirSync('.data', { recursive: true }) }
  db = new Database(path); db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON')
  migrate(db); return db
}
export function getDb() { return db ?? initDb() }
```

`migrate.ts`: 아래 스키마를 `db.exec()` (전부 `CREATE TABLE IF NOT EXISTS`):

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  company TEXT NOT NULL, department TEXT NOT NULL, team TEXT NOT NULL,
  position TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('M','F')),
  birth_year INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')));
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT, isbn13 TEXT UNIQUE, title TEXT NOT NULL,
  author TEXT NOT NULL, publisher TEXT, category TEXT NOT NULL, description TEXT,
  cover_url TEXT, pub_date TEXT, page_count INTEGER);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id), user_id INTEGER NOT NULL REFERENCES users(id),
  loaned_at TEXT NOT NULL DEFAULT (datetime('now')), due_at TEXT NOT NULL, returned_at TEXT);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id), user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','canceled','fulfilled')));
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, author TEXT, isbn13 TEXT, cover_url TEXT, reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected')));
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id), user_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS review_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id), user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(review_id, user_id));
CREATE TABLE IF NOT EXISTS wishlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id), book_id INTEGER NOT NULL REFERENCES books(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, book_id));
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
  book_id INTEGER REFERENCES books(id), image_path TEXT NOT NULL, caption TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id), user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(post_id, user_id));
CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id), user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('book','post','review')), target_id INTEGER NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
```

- [ ] **Step 3: userRepo / bookRepo 구현** — prepared statement 사용, snake→camel 매핑 함수 각 파일 안에 둔다. `bookRepo.findAll`은 `query`가 있으면 `title LIKE ? OR author LIKE ?`(`%q%`), `category` 필터 AND.
- [ ] **Step 4: 실패하는 테스트 작성 → 통과 확인** (`tests/db.test.ts`)

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'
beforeEach(() => { initDb(':memory:') })
describe('bookRepo', () => {
  it('insert 후 findAll/findById/검색이 동작한다', () => {
    const id = bookRepo.insert({ isbn13: '9791165210748', title: '팀장의 탄생', author: '줄리 주오',
      publisher: '더퀘스트', category: '경제경영', description: 'd', coverUrl: 'c', pubDate: '2020-05-01', pageCount: 344 })
    expect(bookRepo.findById(id)?.title).toBe('팀장의 탄생')
    expect(bookRepo.findAll({ query: '팀장' })).toHaveLength(1)
    expect(bookRepo.findAll({ query: '없는책' })).toHaveLength(0)
  })
})
```

Run: `npx vitest run tests/db.test.ts` → PASS 확인 (먼저 구현 전 FAIL 확인).
- [ ] **Step 5: Commit** — `feat: 도메인 타입, SQLite 스키마, user/book 레포지토리`

---

### Task 3: loanService — 대출/반납/예약 규칙 (TDD 핵심)

**Files:**
- Create: `server/repositories/{loanRepo,reservationRepo}.ts`, `server/services/loanService.ts`, `server/utils/errors.ts`
- Test: `tests/loanService.test.ts`

**Interfaces:**
- Consumes: `getDb`, `bookRepo`, `userRepo`
- Produces:
  - `class ApiError extends Error { constructor(public statusCode: number, message: string) }` (errors.ts)
  - `loanRepo.activeByBook(bookId): Loan | undefined`, `loanRepo.findByUser(userId, opts?: { active?: boolean; returnedFrom?: string; returnedTo?: string }): Loan[]`, `loanRepo.insert(bookId, userId, dueAt): number`, `loanRepo.findById(id)`, `loanRepo.markReturned(id): void`, `loanRepo.recent(limit): Loan[]`
  - `reservationRepo.firstWaiting(bookId): Reservation | undefined`, `reservationRepo.waitingByUser(userId)`, `reservationRepo.insert(bookId, userId)`, `reservationRepo.updateStatus(id, status)`, `reservationRepo.findById(id)`, `reservationRepo.countWaiting(bookId): number`
  - `loanService.borrow(userId, bookId): Loan` — 규칙 위반 시 `ApiError(409, ...)`
  - `loanService.return_(userId, loanId, opts?: { asAdmin?: boolean }): Loan`
  - `loanService.reserve(userId, bookId): Reservation`
  - `loanService.bookStatus(bookId): { status: 'available'|'loaned'; dueAt?: string; waitingCount: number; reservedForUserId?: number }`

- [ ] **Step 1: 실패하는 테스트 전체 작성** (`tests/loanService.test.ts`) — 픽스처: `initDb(':memory:')`, 사용자 2명(u1, u2)·책 1권(b1) 삽입 헬퍼.

```ts
// 케이스 목록 (전부 it()로 작성)
// 1. 대출 성공: due_at = 대출일 + 14일, activeByBook 존재
// 2. 이미 대출 중인 책 → borrow가 ApiError 409 throw
// 3. 반납 성공: returned_at 세팅, 이후 다시 대출 가능
// 4. 남의 loan 반납 → 403 (asAdmin이면 허용)
// 5. 대출 중이 아닌 책 예약 → 409
// 6. 본인이 빌린 책 예약 → 409
// 7. 중복 예약(같은 유저, waiting 존재) → 409
// 8. 예약 흐름: u1 대출 → u2 예약 → u1 반납 → u1(제3자) 대출 시도 409, u2 대출 성공 + 예약 fulfilled
// 9. bookStatus: 대출중이면 { status: 'loaned', waitingCount }
```

예시 (8번 — 가장 중요한 케이스):

```ts
it('반납된 책에 대기 예약이 있으면 1순위만 대출할 수 있다', () => {
  const l = loanService.borrow(u1, b1)
  loanService.reserve(u2, b1)
  loanService.return_(u1, l.id)
  expect(() => loanService.borrow(u3, b1)).toThrowError(/예약자가 있는/)
  const l2 = loanService.borrow(u2, b1)
  expect(l2.userId).toBe(u2)
  expect(reservationRepo.firstWaiting(b1)).toBeUndefined() // fulfilled 처리됨
})
```

- [ ] **Step 2: 실행해 FAIL 확인** — `npx vitest run tests/loanService.test.ts`
- [ ] **Step 3: loanRepo/reservationRepo/loanService 구현** — 핵심 로직:

```ts
// loanService.borrow
const book = bookRepo.findById(bookId); if (!book) throw new ApiError(404, '없는 책이에요')
if (loanRepo.activeByBook(bookId)) throw new ApiError(409, '이미 대출 중인 책이에요')
const first = reservationRepo.firstWaiting(bookId)
if (first && first.userId !== userId) throw new ApiError(409, '예약자가 있는 책이에요')
if (first) reservationRepo.updateStatus(first.id, 'fulfilled')
const dueAt = new Date(Date.now() + 14 * 86400_000).toISOString()
return loanRepo.findById(loanRepo.insert(bookId, userId, dueAt))!
```

`reserve`: activeByBook 없으면 409 '대출 가능한 책은 바로 대출하세요', active.userId === userId면 409 '본인이 대출 중인 책이에요', `waitingByUser` 중 같은 book 있으면 409 '이미 예약한 책이에요'.
`return_`: loan 없으면 404, `loan.userId !== userId && !asAdmin`이면 403, 이미 반납 409, `markReturned`.
- [ ] **Step 4: 전체 테스트 PASS 확인** → **Step 5: Commit** — `feat: 대출/반납/예약 규칙 loanService (+테스트)`

---

### Task 4: 알라딘 시드 스크립트

**Files:**
- Create: `server/services/aladinService.ts`, `scripts/seed.ts`

**Interfaces:**
- Consumes: repos 전부, `initDb`
- Produces:
  - `aladinService.bestsellers(categoryId: number, count: number): Promise<AladinItem[]>` — `AladinItem { title, author, publisher, pubDate, description, isbn13, cover, categoryName, pageCount: number|null }`
  - `aladinService.search(query: string): Promise<AladinItem[]>`
  - `npm run seed` → 책 40권±, 직원 12명(관리자 1), 반납 완료 대출 다수(최근 3개월 날짜 분산), 진행 중 대출 3건(연체 1 포함), 리뷰 12건+추천, 예약 1건, 찜 4건, 구매신청 2건, 피드 3건(표지 이미지 URL을 image_path로), 신고 1건

- [ ] **Step 1: aladinService 구현** — `http://www.aladin.co.kr/ttb/api/ItemList.aspx`에 `{ ttbkey, QueryType: 'Bestseller', SearchTarget: 'Book', MaxResults, CategoryId, output: 'js', Version: '20131101', Cover: 'Big' }`. 검색은 `ItemSearch.aspx` + `Query`. pageCount는 `ItemLookUp.aspx`(`ItemIdType=ISBN13`, `OptResult=packing`)의 `item[0]?.subInfo?.itemPage ?? null` — **첫 실행에서 실제 응답 JSON을 콘솔로 찍어 필드명 확인 후 확정** (docs/references/외부-API.md 참고). ttbkey는 `process.env.NUXT_ALADIN_TTB_KEY`.
- [ ] **Step 2: seed.ts 작성** — 카테고리 CID `[170 경제경영, 351 컴퓨터/모바일, 336 자기계발, 656 인문]`별 베스트셀러 10권 수집→`bookRepo.insert`(isbn13 중복 skip). 직원 12명은 로그인 목업(design/mockups/v1a/login.html)의 명단·소속·직급 그대로 + gender/birth_year 분산, `도서관리자`만 `role: 'admin'`. 활동 데이터는 loanService를 직접 호출하지 말고 **SQL로 과거 날짜를 넣는다** (returned_at을 8~9월에 분산해 달력·랭킹이 채워지게).
- [ ] **Step 3: 검증** — `.env`에 실키 넣고 `npm run seed` → 콘솔 요약(books N, users 12, loans N...) 출력. `npx tsx -e "..."`로 count 쿼리 확인.
- [ ] **Step 4: Commit** — `feat: 알라딘 기반 시드 스크립트`

---

### Task 5: API 유틸 + users/books/reviews 엔드포인트

**Files:**
- Create: `server/utils/api.ts`, `server/repositories/{reviewRepo,reviewVoteRepo}.ts`,
  `server/api/users/index.get.ts`, `server/api/books/index.get.ts`, `server/api/books/[id]/index.get.ts`,
  `server/api/books/[id]/reviews.get.ts`, `server/api/books/[id]/reviews.post.ts`,
  `server/api/reviews/[id]/votes.post.ts`, `server/api/reviews/[id]/votes.delete.ts`

**Interfaces:**
- Consumes: repos, `loanService.bookStatus`, `ApiError`
- Produces:
  - `requireUser(event): User` — `x-user-id` 헤더 → userRepo 조회, 없으면 401 (api.ts)
  - `requireAdmin(event): User` — requireUser + role 검사, 아니면 403
  - `handleApi(fn)` — 핸들러 래퍼: ApiError를 `createError({ statusCode, message })`로 변환
  - `GET /api/users` → `User[]` (로그인 화면용, 인증 불필요)
  - `GET /api/books?query=&category=` → `(Book & { status, waitingCount, avgRating, reviewCount })[]`
  - `GET /api/books/:id` → Book + bookStatus + avgRating + wishCount + `myState { wished, myActiveLoanId }`
  - `GET /api/books/:id/reviews` → `(Review & { userName, department, voteCount, votedByMe })[]` voteCount 내림차순
  - `POST /api/books/:id/reviews` body `{ rating, content }` → 생성 Review
  - `POST /api/reviews/:id/votes` (중복 409) / `DELETE /api/reviews/:id/votes`
  - `reviewRepo.listByBook(bookId, meId)` (JOIN으로 위 필드 채움), `reviewRepo.insert`, `reviewRepo.avgForBook(bookId): { avg: number|null; count: number }`, `reviewVoteRepo.insert(reviewId, userId)`(UNIQUE 위반 시 ApiError 409), `reviewVoteRepo.remove(reviewId, userId)`

- [ ] **Step 1: api.ts 구현** (`getRouterParam`, `getHeader` 사용). **Step 2: 레포 2개 구현.**
- [ ] **Step 3: 엔드포인트 7개 구현** — 예시 패턴 (모든 핸들러 동일 스타일):

```ts
// server/api/books/[id]/reviews.post.ts
export default defineEventHandler(handleApi(async (event) => {
  const me = requireUser(event)
  const bookId = Number(getRouterParam(event, 'id'))
  const { rating, content } = await readBody<{ rating: number; content: string }>(event)
  if (!rating || rating < 1 || rating > 5 || !content?.trim()) throw new ApiError(400, '별점(1~5)과 한줄 리뷰를 입력해주세요')
  return reviewRepo.insert(bookId, me.id, rating, content.trim())
}))
```

- [ ] **Step 4: curl 검증** — `curl localhost:3000/api/users`, `curl -H "x-user-id: 1" "localhost:3000/api/books?query=팀장"`, 리뷰 작성/추천/중복 추천 409 확인.
- [ ] **Step 5: Commit** — `feat: users/books/reviews REST API`

---

### Task 6: loans / reservations 엔드포인트

**Files:**
- Create: `server/api/loans/index.get.ts`, `server/api/loans/index.post.ts`, `server/api/loans/[id].patch.ts`,
  `server/api/reservations/index.get.ts`, `server/api/reservations/index.post.ts`, `server/api/reservations/[id].delete.ts`

**Interfaces:**
- Consumes: `loanService`, `loanRepo`, `reservationRepo`, `requireUser`
- Produces:
  - `GET /api/loans?userId=&active=true|false&returned=true&from=&to=` → `(Loan & { book: Book })[]` — userId 생략+admin이면 전체(관리자 대시보드용), 일반 유저는 본인 것만
  - `POST /api/loans` body `{ bookId }` → 201 Loan (loanService.borrow)
  - `PATCH /api/loans/:id` body `{ returned: true }` → Loan (loanService.return_, admin은 남의 것도 가능 `asAdmin`)
  - `GET /api/reservations?userId=` / `POST /api/reservations {bookId}` / `DELETE /api/reservations/:id` (본인 것만, status→canceled)

- [ ] **Step 1: 6개 핸들러 구현** (Task 5 패턴 동일. GET loans의 book JOIN은 loanRepo에 `withBook` 매핑 추가).
- [ ] **Step 2: curl 검증** — 대출→중복 대출 409→반납→예약 흐름 E2E, `?returned=true&from=2026-09-01` 필터 확인.
- [ ] **Step 3: Commit** — `feat: loans/reservations REST API`

---

### Task 7: wishlists / purchase-requests / reports / aladin 프록시

**Files:**
- Create: `server/repositories/{wishlistRepo,purchaseRequestRepo,reportRepo}.ts`,
  `server/api/wishlists/index.get.ts`, `.../index.post.ts`, `.../[id].delete.ts`,
  `server/api/purchase-requests/index.get.ts`, `.../index.post.ts`,
  `server/api/reports/index.post.ts`, `server/api/aladin/search.get.ts`

**Interfaces:**
- Produces:
  - `GET/POST/DELETE /api/wishlists` (`{bookId}`, UNIQUE 위반 409 '이미 찜한 책이에요')
  - `GET /api/purchase-requests?userId=` / `POST /api/purchase-requests` body `{ title, author?, isbn13?, coverUrl?, reason? }`
  - `POST /api/reports` body `{ targetType, targetId, reason }`
  - `GET /api/aladin/search?query=` → `AladinItem[]` (aladinService.search 프록시)
  - 각 레포: `listByUser`, `insert`, `remove`/`updateStatus(id, status)` 시그니처

- [ ] **Step 1: 레포 3개 + 핸들러 7개 구현** → **Step 2: curl 검증** (찜 중복 409, 알라딘 검색에 실키 필요) → **Step 3: Commit** — `feat: wishlists/purchase-requests/reports API + 알라딘 프록시`

---

### Task 8: rankings / stats 엔드포인트

**Files:**
- Create: `server/services/rankingService.ts`, `server/services/statsService.ts`,
  `server/api/rankings/index.get.ts`, `server/api/stats/index.get.ts`

**Interfaces:**
- Produces:
  - `rankingService.rank(by: 'user'|'team'|'department'|'company', period: 'month'|'all'): RankRow[]` — `RankRow { key: string; label: string; sub?: string; count: number; userId?: number }` **반납 완료 loans COUNT 기준**, count DESC + 동률 공동 순위(프론트에서 index로 표기)
  - `statsService.byGroup(by: 'department'|'gender'|'age'|'position'|'company'|'team', period): StatRow[]` — `StatRow { label: string; loanCount: number; doneCount: number; headCount: number; perHead: number }` age는 `(2026 - birth_year)/10` 십의 자리로 '20대'~'50대+'
  - `GET /api/rankings?by=&period=` (로그인 필요) / `GET /api/stats?by=&period=` (**requireAdmin**)

핵심 SQL (rankingService, period=month는 `returned_at >= date('now','start of month')`):

```sql
SELECT u.id, u.name, u.company, u.department, u.team, u.position, COUNT(l.id) AS cnt
FROM loans l JOIN users u ON u.id = l.user_id
WHERE l.returned_at IS NOT NULL AND (:from IS NULL OR l.returned_at >= :from)
GROUP BY <by 기준 컬럼> ORDER BY cnt DESC
```

- [ ] **Step 1: 서비스 2개 + 핸들러 2개 구현** → **Step 2: curl 검증** (시드 데이터 기준 by=user/team/gender 응답 눈으로 확인, 비관리자 stats 403) → **Step 3: Commit** — `feat: 랭킹/통계 API (반납 기록 기준)`

---

### Task 9: AI 에이전트 코어 + 조회 도구 5종

**Files:**
- Create: `server/ai/agent.ts`, `server/ai/prompts.ts`, `server/ai/parse.ts`,
  `server/ai/tools/{searchBooks,getBookDetail,getMyLoans,getReviews,searchAladin}.ts`

**Interfaces:**
- Consumes: repos, `loanService.bookStatus`, `aladinService`
- Produces:
  - `createTools(userId: number): StructuredToolInterface[]` (agent.ts에서 조합; Task 10에서 행동 도구 추가)
  - `runAgent(userId: number, messages: { role: 'user'|'assistant'; content: string }[], systemExtra?: string): Promise<AiAnswer>`
  - `parseAiAnswer(text: string): AiAnswer` (parse.ts — 첫 `{...}` JSON 블록 추출·검증, 실패 시 `{ message: text, bookIds: [], actions: [] }`)

- [ ] **Step 1: 도구 5종 작성** — 1도구 1파일, 팩토리 함수 `(userId) => tool(...)`. 예시:

```ts
// server/ai/tools/searchBooks.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { bookRepo } from '../../repositories/bookRepo'
import { loanService } from '../../services/loanService'
export const makeSearchBooks = () => tool(
  async ({ query, category }) => JSON.stringify(
    bookRepo.findAll({ query, category }).slice(0, 8)
      .map(b => ({ id: b.id, title: b.title, author: b.author, category: b.category,
        status: loanService.bookStatus(b.id).status }))),
  { name: 'search_books',
    description: '사내 서가에서 제목/저자 키워드나 카테고리로 도서를 검색한다. 결과에 대출 상태 포함.',
    schema: z.object({ query: z.string().optional(), category: z.string().optional() }) })
```

`get_my_loans`(userId 클로저, active/returned 모두 + 이달 완독 수 = get_my_reading_stats 역할 겸함), `get_book_detail`(리뷰 요약 포함), `get_reviews`, `search_aladin`.
- [ ] **Step 2: prompts.ts** — 시스템 프롬프트에 반드시 포함: AI 사서 페르소나(존댓말), 도구 우선 사용, **최종 응답은 아래 JSON 하나만** (코드펜스 금지):

```
{"message":"...", "bookIds":[숫자], "actions":[{"type":"navigate","label":"버튼 문구","to":"/books/12?review=1"}]}
```

사용 가능한 경로 카탈로그 명시: `/books/:id`, `/books/:id?review=1`(리뷰 폼), `/my`, `/calendar`, `/rankings`, `/feed`, `/places`. 추천 시 근거(대출 이력·리뷰) 언급 지시.
- [ ] **Step 3: agent.ts** —

```ts
import { ChatAnthropic } from '@langchain/anthropic'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
export async function runAgent(userId, messages, systemExtra = '') {
  const config = useRuntimeConfig()
  const llm = new ChatAnthropic({ apiKey: config.anthropicApiKey, model: 'claude-sonnet-5', maxTokens: 1500 })
  const agent = createReactAgent({ llm, tools: createTools(userId), prompt: SYSTEM_PROMPT + systemExtra })
  const res = await agent.invoke({ messages }, { recursionLimit: 12 })
  const last = res.messages.at(-1)
  return parseAiAnswer(typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content))
}
```

(설치된 `@langchain/langgraph` 버전에서 `prompt` 옵션이 없으면 `stateModifier`로 — 구현 시 d.ts 확인.)
- [ ] **Step 4: 검증 스크립트** — `npx tsx -e`로 `runAgent(1, [{role:'user',content:'리더십 책 추천해줘'}])` 호출, JSON 파싱된 AiAnswer 콘솔 확인 (도구 호출 로그 포함).
- [ ] **Step 5: Commit** — `feat: LangGraph AI 사서 에이전트 + 조회 도구 5종`

---

### Task 10: 행동 도구 5종 + /api/ai/chat, /api/ai/search

**Files:**
- Create: `server/ai/tools/{borrowBook,returnBook,reserveBook,requestPurchase,addWishlist}.ts`,
  `server/api/ai/chat.post.ts`, `server/api/ai/search.post.ts`

**Interfaces:**
- Produces:
  - 행동 도구: loanService/레포 호출, 성공 시 `JSON.stringify({ ok: true, dueAt? })`, ApiError는 **throw하지 말고** `JSON.stringify({ ok: false, error: e.message })` 반환 (모델이 사용자에게 설명하도록)
  - `POST /api/ai/chat` body `{ messages: {role,content}[], context?: { path?: string; bookId?: number } }` → `AiAnswer & { books: Book[] }` (bookIds를 서버에서 resolve)
  - `POST /api/ai/search` body `{ query: string }` → 동일 응답형. systemExtra로 "단발 검색 모드: 대화 없이 질문 해석→추천→결과" 지시
  - context.bookId가 있으면 systemExtra에 해당 책 정보(제목/저자/소개) 주입

- [ ] **Step 1: 행동 도구 5종 구현** (borrow 예시: `loanService.borrow(userId, bookId)` try/catch → 위 규약).
- [ ] **Step 2: 엔드포인트 2개 구현** — `requireUser`, ANTHROPIC 키 없으면 503 `'AI를 사용할 수 없어요'`. chat은 messages 최근 12개로 자름.
- [ ] **Step 3: curl 검증** — `"팀장의 탄생 대출해줘"` → 대출 실제 반영 + message에 반납일, `"이미 대출된 책"` 시나리오에서 ok:false 설명 확인. `/api/ai/search`에 `"협업 잘하는 법"` 질의.
- [ ] **Step 4: Commit** — `feat: AI 행동 도구 + chat/search 엔드포인트`

---

### Task 11: 프론트 공통 — 스타일/로그인/헤더/인증 가드

**Files:**
- Create: `app/assets/css/main.css`, `app/composables/useCurrentUser.ts`, `app/composables/useApi.ts`,
  `app/components/common/AppHeader.vue`, `app/pages/login.vue`, `app/middleware/auth.global.ts`

**Interfaces:**
- Produces:
  - `main.css` = `design/mockups/v1a/style.css` 전체 복사(@import 2줄은 nuxt.config head로 옮겼으므로 제거)
  - `useCurrentUser(): { user: Ref<User|null>; login(u: User): void; logout(): void }` — localStorage `bb:user`, `useState`로 SSR 안전하게
  - `useApi(): $fetch` 래퍼 — `x-user-id` 자동 첨부, ofetch 에러의 `data.message`를 토스트/알럿으로
  - `AppHeader.vue` props `{ active: string }` — 목업 nav 마크업 포팅, NuxtLink 사용, 우측 사용자명 + 로그아웃(클릭 시 logout→/login)
  - `auth.global.ts` — `/login` 외 페이지에서 user 없으면 `/login`으로, `/admin*`은 role 검사

- [ ] **Step 1: 파일 6개 구현** — login.vue는 목업 `login.html` 포팅, `GET /api/users`로 카드 렌더, 클릭 시 `login(u)` 후 `navigateTo(u.role === 'admin' ? '/admin' : '/')`.
- [ ] **Step 2: 브라우저 검증** — 비로그인 → /login 리다이렉트, 카드 클릭 → 메인 이동(빈 페이지 OK), 새로고침 유지.
- [ ] **Step 3: Commit** — `feat: 프론트 공통(스타일·로그인·헤더·가드)`

---

### Task 12: 메인 페이지 (검색 + AI 검색 영역 + 서가)

**Files:**
- Create: `app/pages/index.vue`, `app/components/book/{BookCard.vue,CoverImage.vue,StatusBadge.vue,BookShelfRow.vue}`, `app/components/ai/AiSearchPanel.vue`, `app/components/common/{SearchBar.vue,CategoryChips.vue}`

**Interfaces:**
- Consumes: `GET /api/books`, `POST /api/ai/search`
- Produces:
  - `CoverImage.vue` props `{ src: string|null; alt: string }` — 목업 `.cv`(책등 하이라이트) 래퍼
  - `StatusBadge.vue` props `{ status: 'available'|'loaned'; waitingCount?: number }`
  - `BookCard.vue` props `{ book }` → 상세로 NuxtLink
  - `BookShelfRow.vue` props `{ books: Book[]; columns?: number }` — 표지 줄 + `.shelf` + 메타 줄 (main.html 구조)
  - `AiSearchPanel.vue` props `{ query: string }` — mounted 시 `/api/ai/search` 호출, 로딩 스켈레톤 → message + books 카드 + actions 버튼(navigate)
  - `index.vue` — 검색어 없으면 카테고리별 서가, 검색하면 AiSearchPanel(상단) + 키워드 결과 리스트(하단). 검색 상태는 `?q=` 쿼리스트링

- [ ] **Step 1: 컴포넌트 6개 + 페이지 구현** (마크업/클래스는 `main.html`에서 포팅, 데이터 바인딩만 교체).
- [ ] **Step 2: 브라우저 검증** — "팀장이 처음인데 리더십 책 추천해줘" 검색 → AI 영역 답변+책 카드+버튼, 아래 키워드 결과. AI 키 제거 시 안내 문구 + 키워드 결과는 정상.
- [ ] **Step 3: Commit** — `feat: 메인 검색 + AI 검색 영역`

---

### Task 13: 책 상세 페이지

**Files:**
- Create: `app/pages/books/[id].vue`, `app/components/review/{ReviewList.vue,ReviewForm.vue,StarRating.vue}`

**Interfaces:**
- Consumes: `GET /api/books/:id`, reviews API, `POST /api/loans`, `PATCH /api/loans/:id`, `POST /api/reservations`, wishlists API, `POST /api/reports`
- Produces:
  - `StarRating.vue` props `{ modelValue: number; readonly?: boolean }` (v-model)
  - `ReviewForm.vue` props `{ bookId }` emit `created` — `?review=1`이면 input에 autofocus
  - `ReviewList.vue` props `{ bookId }` — 추천순, 👍 토글(`votedByMe`)
  - 페이지: 상태에 따라 [대출하기]/[반납하기]/[예약하기] 분기, 찜 토글, 분실·파손 신고(prompt→POST /api/reports), "AI에게 이 책 물어보기" 버튼 → `chatOpenWith(bookId)` (Task 14의 useChat 전역 상태 호출 — Task 14 전엔 버튼만 두고 no-op)

- [ ] **Step 1: 구현** (`book-detail.html` 포팅) → **Step 2: 검증** — 대출→뱃지 변화→반납, 리뷰 작성·추천 토글, `?review=1` 포커스 → **Step 3: Commit** — `feat: 책 상세 (대출·리뷰·찜·신고)`

---

### Task 14: 챗봇 위젯 (FAB + 패널)

**Files:**
- Create: `app/composables/useChat.ts`, `app/components/ai/{ChatWidget.vue,ChatMessage.vue}`, Modify: `app/app.vue`

**Interfaces:**
- Consumes: `POST /api/ai/chat`
- Produces:
  - `useChat()` → `{ open: Ref<boolean>, messages: Ref<ChatMsg[]>, sending: Ref<boolean>, send(text: string): Promise<void>, openWith(bookId?: number): void }` — `useState` 전역. `ChatMsg { role: 'user'|'assistant'; content: string; books?: Book[]; actions?: ChatAction[] }`. send는 히스토리 전체 + `context: { path: route.fullPath, bookId }` 전송
  - `ChatWidget.vue` — `chatbot.html`의 FAB+패널 포팅. **user 없으면 렌더링 안 함**. actions는 버튼 → `navigateTo(a.to)` + 패널 닫기. books는 미니 카드
  - `app.vue`: `<NuxtPage /> <ChatWidget />`

- [ ] **Step 1: 구현** → **Step 2: 검증** — 로그인 전 FAB 없음 확인, "리더십 책 추천해줘"→카드/버튼, "첫 번째 대출해줘"→실제 대출+내서재 반영, [리뷰 쓰러가기] 클릭→`/books/:id?review=1` 이동·폼 포커스 → **Step 3: Commit** — `feat: AI 사서 챗봇 위젯`

---

### Task 15: 내 서재 (책쌓기 + 책장)

**Files:**
- Create: `app/pages/my.vue`, `app/components/reading/BookStack.vue`, `app/components/book/ShelfSection.vue`

**Interfaces:**
- Consumes: `GET /api/loans?userId=me...`(active/returned), wishlists, reservations, purchase-requests API, `PATCH /api/loans/:id`
- Produces:
  - `BookStack.vue` props `{ doneLoans: (Loan & { book: Book })[] }` — my.html의 책등 쌓기(제목·색은 book에서, 색상은 `id % palette.length`로 6색 팔레트 순환), 올해/이달 완독 수 표기
  - `ShelfSection.vue` props `{ title: string; books: Book[]; emptyText?: string; metaTexts?: string[] }` — 표지+선반+메타
  - 페이지 구성: 프로필+책쌓기 / 읽고 있는 책(대출일·D-day·반납 버튼, 연체 강조) / 읽은 책 선반(완독일 메타) / 찜한 책 선반 / 예약·신청 패널

- [ ] **Step 1: 구현** (my.html 포팅) → **Step 2: 검증** — 반납하면 읽은 책 선반+책쌓기에 즉시 반영 → **Step 3: Commit** — `feat: 내 서재 (책쌓기·책장)`

---

### Task 16: 도서 달력

**Files:**
- Create: `app/pages/calendar.vue`, `app/components/reading/ReadingCalendar.vue`

**Interfaces:**
- Consumes: `GET /api/loans?userId=me&returned=true&from=&to=`
- Produces: `ReadingCalendar.vue` props `{ year, month, loans }` — 월 그리드 계산은 컴포넌트 내 순수 함수 `buildMonthCells(year, month): { date: string; inMonth: boolean }[]`(42칸), 반납일 매칭 칸에 표지(클릭→상세). 페이지는 ◀▶로 month state 변경 + 사이드 "이달의 완독" 리스트

- [ ] **Step 1: 구현** (calendar.html 포팅) → **Step 2: 검증** — 시드의 8~9월 반납 기록이 해당 달에 표시, 월 이동 → **Step 3: Commit** — `feat: 도서 달력`

---

### Task 17: 랭킹 보드

**Files:**
- Create: `app/pages/rankings.vue`, `app/components/reading/RankPodium.vue`

**Interfaces:**
- Consumes: `GET /api/rankings?by=&period=`
- Produces: 탭(개인/팀/부서/계열사)+기간 칩 → API 재호출. 상위 3 포디움(`RankPodium` props `{ top3: RankRow[] }`), 4위~ 리스트(막대 폭 = count/최대 count), `row.userId === me.id`면 하이라이트+"나" 뱃지. 부제 "대출-반납 기록(완독 권수) 기준"

- [ ] **Step 1: 구현** (rankings.html 포팅) → **Step 2: 검증** — 탭/기간 전환, 내 순위 강조 → **Step 3: Commit** — `feat: 독서 랭킹 보드`

---

### Task 18: 커뮤니티 피드 (업로드 포함)

**Files:**
- Create: `server/services/uploadService.ts`, `server/repositories/{postRepo,postLikeRepo,postCommentRepo}.ts`,
  `server/api/posts/index.get.ts`, `.../index.post.ts`, `server/api/posts/[id]/likes.post.ts`, `.../likes.delete.ts`,
  `server/api/posts/[id]/comments.get.ts`, `.../comments.post.ts`, `server/api/uploads/[name].get.ts`,
  `app/pages/feed.vue`, `app/components/feed/{PostCard.vue,PostComposer.vue}`

**Interfaces:**
- Produces:
  - `uploadService.save(file: { data: Buffer; type?: string }): string` — `.data/uploads/<uuid>.<ext>` 저장, `/api/uploads/<name>` 경로 반환. `serve(name): { data: Buffer; type: string }` (경로 탈출 방지: name은 `/[a-z0-9-]+\.(jpg|jpeg|png|webp)/`만 허용)
  - `POST /api/posts` — `readMultipartFormData`로 `image`(필수)/`caption`/`bookId` 파싱
  - `GET /api/posts` → `(Post & { userName, department, book?: Book, likeCount, likedByMe, commentCount })[]` 최신순
  - likes 토글(중복 409), comments GET/POST
  - `PostComposer.vue` — 파일 선택(미리보기) + 캡션 + 책 선택(내 대출 책 셀렉트), FormData POST 후 emit `created`
  - `PostCard.vue` props `{ post }` — feed.html 카드 포팅, ♥ 토글, 댓글 접기/펼치기+작성

- [ ] **Step 1: 서버 구현** → **Step 2: 프론트 구현** → **Step 3: 검증** — 사진 업로드→피드 표시→좋아요/댓글, 새로고침 유지 → **Step 4: Commit** — `feat: 커뮤니티 피드`

---

### Task 19: 책 읽기 좋은 장소

**Files:**
- Create: `server/services/naverPlaceService.ts`, `server/api/places/index.get.ts`, `server/api/ai/places.post.ts`,
  `app/pages/places.vue`, `app/components/common/NaverMap.client.vue`

**Interfaces:**
- Produces:
  - `naverPlaceService.search(query: string): Promise<Place[]>` — `Place { name, category, address, mapx, mapy }` (openapi.naver.com/v1/search/local.json, 헤더 `X-Naver-Client-Id/Secret`, HTML 태그 제거)
  - `GET /api/places?query=` — 기본 query '용인 수지 카페'·'도서관'·'공원' 3회 검색 merge (15곳)
  - `POST /api/ai/places` body `{ places: Place[] }` → `{ ranked: (Place & { reason: string })[] }` — ChatAnthropic 직접 호출(에이전트 불필요), "책 읽기 좋은 순 정렬 + 한줄 이유" JSON 강제, parse는 Task 9 `parseAiAnswer` 패턴 재사용한 전용 파서
  - `NaverMap.client.vue` props `{ places, clientId }` — 네이버 지도 JS(`oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=`) 동적 script 로드, 마커+번호. **clientId 없거나 로드 실패 시 목업의 스타일드 placeholder 렌더** (places.html의 .map 포팅)
  - `places.vue` — 좌 지도/우 리스트, [AI 추천받기] 클릭 시 `/api/ai/places` 호출해 정렬+이유 표시

- [ ] **Step 1: 서버 → Step 2: 프론트 → Step 3: 검증** (키 없는 상태의 폴백 포함) → **Step 4: Commit** — `feat: 책 읽기 좋은 장소 (지도+AI 큐레이션)`

---

### Task 20: 관리자 대시보드

**Files:**
- Create: `server/api/books/index.post.ts`, `server/api/books/[id]/index.delete.ts`,
  `server/api/purchase-requests/[id].patch.ts`, `server/api/reports/index.get.ts`, `server/api/reports/[id].patch.ts`,
  `app/pages/admin/index.vue`, `app/components/admin/{StatTiles.vue,LoanTable.vue,RequestTable.vue,ReportTable.vue,BookRegister.vue}`

**Interfaces:**
- Produces:
  - 관리자 API 5개 (전부 `requireAdmin`): 책 등록 body = AladinItem 형태 → bookRepo.insert / 삭제 / 신청 `{status: 'approved'|'rejected'}` (approved면 응답에 `registerPayload` 포함해 프론트가 이어서 책 등록 호출) / 신고 목록·처리
  - `StatTiles.vue` — `GET /api/loans?active=true`(admin 전체)·연체 계산·신청/신고 대기 수를 페이지에서 집계해 props로
  - `BookRegister.vue` — `GET /api/aladin/search` → 결과 행 [서가에 등록] → `POST /api/books`
  - admin/index.vue: admin.html 포팅, AppHeader 대신 관리자 네비(대시보드/통계 + "사용자 화면 →")

- [ ] **Step 1: API → Step 2: 화면 → Step 3: 검증** — 일반 유저로 `/api/stats` 등 403, 관리자로 강제 반납/승인/신고 처리/책 등록 동작 → **Step 4: Commit** — `feat: 관리자 대시보드`

---

### Task 21: 관리자 통계 화면

**Files:**
- Create: `app/pages/admin/stats.vue`, `app/components/admin/{HBarChart.vue,VColChart.vue}`

**Interfaces:**
- Consumes: `GET /api/stats?by=&period=`
- Produces:
  - `HBarChart.vue` props `{ rows: { label: string; value: number; sub?: string }[] }` — admin-stats.html의 CSS 가로 막대 포팅 (단일 색조 `--red`, 4px 라운드 데이터 끝, 눈금선, 값 직접 레이블). `VColChart.vue` 동일 구조 세로형
  - stats.vue: 그룹 select + 기간 칩 → API 재호출, 메인 차트(선택 그룹) + 보조 차트(나이대) + 요약 표

- [ ] **Step 1: 구현 → Step 2: 검증** (그룹 전환 시 차트 갱신) → **Step 3: Commit** — `feat: 관리자 통계`

---

### Task 22: 배포 준비 (Docker + README)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `README.md`

- [ ] **Step 1: Dockerfile**

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm i -D tsx
VOLUME /app/.data
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

- [ ] **Step 2: README.md** — 실행법(dev/seed/build/docker run -v 볼륨·--env-file), 필요한 키 5개와 발급처(네이버 2계열 주의), 기능 목록, 우선순위상 미구현 항목 명시.
- [ ] **Step 3: 검증** — `npm run build && node .output/server/index.mjs` 부팅+주요 화면 스모크. (Docker 빌드는 데모 시간 여유 있을 때)
- [ ] **Step 4: Commit** — `chore: Dockerfile + README`

---

## Self-Review 결과

- **Spec coverage**: 설계서 5절 API 표의 전 항목이 Task 5~10, 18~20에 매핑됨. 화면 11종(7절)은 Task 11~21에 매핑. 시드(12절)=Task 4, 배포(11절)=Task 22. 누락 없음.
- **Placeholder**: 코드 없는 단계는 목업 파일 포팅(정확한 파일 지정) 또는 curl/브라우저 검증 단계로, TBD류 없음.
- **Type consistency**: `AiAnswer`/`ChatAction`/`RankRow`/`StatRow`/`Place`는 각각 최초 정의 태스크(2, 8, 19)의 시그니처를 후속 태스크가 그대로 사용. `loanService.return_` 명명(예약어 회피) 전 태스크 통일 확인.
