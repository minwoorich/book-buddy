# Book Buddy — 사내 AI 도서시스템 설계서

- 날짜: 2026-09-13
- 성격: 1일짜리 데모 프로젝트 (실제 사내 배포 아님 — 보안·재고 정합성은 느슨하게)
- 작성 배경: 브레인스토밍 세션에서 합의된 내용 정리

## 1. 목표

사내 도서관 웹앱 데모. 핵심 차별점은 **AI 에이전트가 사이트의 행동(대출·예약·구매신청)과
네비게이션(리뷰 쓰러 가기 등)을 대신하거나 안내**하는 경험이다.

기능 범위:

- 도서 검색 (키워드 결과 + 상단 AI 검색 영역, 구글 AI overview 스타일)
- 도서 대출 / 반납 / 예약 (대출 중인 책)
- 희망도서 구매 신청 (알라딘 검색 연동)
- 리뷰: 별점(1~5) + 한줄 리뷰
- 플로팅 AI 챗봇: 추천·검색·요약·Q&A + 도구 실행(대출/예약/신청) + 네비게이션 버튼 제안
- 이름 선택 로그인 (비밀번호 없음)

비범위(명시적 제외): 실제 인증/보안, 다중 재고 수량 관리, 연체 제재, 알림, 관리자 화면.

## 2. 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Nuxt 3 (TypeScript, 프론트 + Nitro 서버 라우트 단일 앱) |
| DB | SQLite (better-sqlite3), 파일 1개 |
| AI | Claude API — LangChain.js (`@langchain/anthropic`, `@langchain/core`, `@langchain/langgraph`의 `createReactAgent`) |
| 모델 | `claude-sonnet-5` |
| 외부 데이터 | 알라딘 Open API (TTB 키, `.env`) — 시드 수집 + 희망도서 검색 |
| 테스트 | Vitest — 대출/예약 비즈니스 규칙 단위 테스트만 (데모 수준) |

환경변수(`.env`): `ANTHROPIC_API_KEY`, `ALADIN_TTB_KEY`

## 3. 프로젝트 구조 (레이어 분리)

한 파일에 몰아넣지 않는다. 각 레이어는 단방향으로만 의존한다:
`api → service → repository → db`, `ai tools → service/repository`.

```
server/
  db/            # 커넥션, 스키마 생성(migrate), 시드 유틸
  repositories/  # 테이블별 CRUD (books, users, loans, reservations, purchaseRequests, reviews)
  services/      # 비즈니스 규칙 (loanService: 대출/반납/예약 규칙, aladinService: 외부 API)
  ai/
    agent.ts     # LangGraph ReAct 에이전트 구성
    tools/       # LangChain tool 정의 (도구 1개 = 파일 1개)
    prompts.ts   # 시스템 프롬프트
  api/           # RESTful 라우트 (아래 5절)
app/ (Nuxt)
  pages/         # login, index(메인 검색), books/[id], my
  components/    # BookCard, SearchBar, AiSearchPanel, ChatWidget, ReviewForm, ReviewList …
  composables/   # useCurrentUser(localStorage 기반), useChat
scripts/
  seed.ts        # 알라딘 API → 책 40권 내외 + 직원 8명 + 데모용 대출/리뷰 삽입
```

## 4. 데이터 모델

| 테이블 | 주요 컬럼 |
|---|---|
| `users` | id, name, department |
| `books` | id, isbn13, title, author, publisher, category, description, cover_url, pub_date |
| `loans` | id, book_id, user_id, loaned_at, due_at(14일), returned_at(null=대출중) |
| `reservations` | id, book_id, user_id, created_at, status(waiting/canceled/fulfilled) |
| `purchase_requests` | id, user_id, title, author, isbn13, cover_url, reason, created_at, status(requested) |
| `reviews` | id, book_id, user_id, rating(1~5), content(한줄), created_at |

규칙(느슨):

- 책당 재고 1권. `loans`에 returned_at이 null인 행이 있으면 대출 중.
- 대출 중인 책만 예약 가능, 본인이 빌린 책은 예약 불가, 중복 예약 불가.
- 반납된 책에 대기 중 예약이 있으면 예약 1순위 사용자만 대출 가능(다른 사용자는 409).
  1순위가 대출하면 해당 예약은 fulfilled 처리. 예약 만료 같은 복잡한 로직은 없음.
- 대출 기한 14일. 연체는 화면에 표시만 하고 제재 없음.

## 5. REST API 설계

자원 중심 URL + 표준 메서드. 사용자 식별은 요청 헤더 `x-user-id`(로그인한 사용자 id)로
전달한다 — 데모용 간이 방식임을 코드 주석 없이 문서로만 명시.

| 메서드/경로 | 설명 |
|---|---|
| `GET /api/users` | 로그인 화면용 직원 목록 |
| `GET /api/books?query=&category=` | 사내 도서 목록/키워드 검색 |
| `GET /api/books/:id` | 상세 (대출 상태, 예약 수 포함) |
| `GET /api/books/:id/reviews` | 리뷰 목록 |
| `POST /api/books/:id/reviews` | 리뷰 작성 `{rating, content}` |
| `GET /api/loans?userId=&active=` | 대출 목록 (내 서재) |
| `POST /api/loans` | 대출 `{bookId}` |
| `PATCH /api/loans/:id` | 반납 `{returned: true}` |
| `GET /api/reservations?userId=` | 내 예약 목록 |
| `POST /api/reservations` | 예약 `{bookId}` |
| `DELETE /api/reservations/:id` | 예약 취소 |
| `GET /api/purchase-requests?userId=` | 내 구매 신청 목록 |
| `POST /api/purchase-requests` | 구매 신청 (알라딘 검색 결과 기반) |
| `GET /api/aladin/search?query=` | 알라딘 도서 검색 프록시 (희망도서용) |
| `POST /api/ai/search` | 메인 페이지 AI 검색 (단발 질의) |
| `POST /api/ai/chat` | 챗봇 대화 (메시지 히스토리 포함, 스테이트리스) |

AI 두 개는 자원형이 아닌 RPC성 엔드포인트로 예외 인정.

## 6. AI 에이전트 설계

LangGraph `createReactAgent` + Claude로 서버에서 도구 실행 루프를 돈다.
챗봇과 AI 검색이 **같은 에이전트 구성을 재사용**하되, AI 검색은 히스토리 없는 단발 호출.

도구 (1도구 1파일, service/repository 재사용):

- 조회: `search_books`, `get_book_detail`, `get_my_loans`, `get_reviews`, `search_aladin`
- 행동: `borrow_book`, `return_book`, `reserve_book`, `request_purchase`

응답 형식: 에이전트 최종 응답은 아래 JSON으로 강제(시스템 프롬프트 + 서버 파싱, 파싱 실패
시 텍스트만 사용하는 폴백):

```json
{
  "message": "사용자에게 보여줄 답변",
  "bookIds": [12, 34],
  "actions": [
    { "type": "navigate", "label": "리뷰 쓰러가기", "to": "/books/12?review=1" }
  ]
}
```

- `bookIds` → 프론트가 책 카드로 렌더링
- `actions` → 버튼으로 렌더링, 클릭 시 라우팅 (AI 주도 네비게이션)
- 대출/예약/신청은 도구 실행으로 즉시 반영하고 결과를 메시지로 알림
- 개인화 추천: `get_my_loans` + `get_reviews`로 이력 조회 후 추천
- 요약/Q&A: 책 `description` + Claude 자체 지식 기반 (50권 규모 — 벡터DB/RAG 불필요)

컨텍스트 주입: 책 상세의 "AI에게 이 책 물어보기" 클릭 시 챗봇을 열며
현재 책 정보를 시스템 컨텍스트로 전달. 현재 페이지 경로도 항상 함께 전달.

## 7. 화면 구성

1. `/login` — 직원 이름 카드 목록, 클릭하면 localStorage에 사용자 저장 후 메인 이동
2. `/` (메인) — 상단 검색바. 검색 시: **AI 검색 영역**(로딩 → 답변 + 책 카드) 위,
   키워드 매칭 결과 리스트 아래. 검색 전: 카테고리별 도서 목록
3. `/books/:id` — 표지·저자·소개·대출 상태, [대출]/[반납]/[예약] 버튼(상태에 따라 노출),
   리뷰 목록 + 작성 폼(`?review=1`이면 폼 자동 포커스), "AI에게 이 책 물어보기" 버튼
4. `/my` (내 서재) — 대출 중/이력, 예약, 구매 신청 목록, 반납 버튼
5. **플로팅 챗봇** — 우하단 호버링 버튼. **로그인 상태에서만 렌더링** (비로그인 화면에는 없음)

## 8. 에러 처리 (데모 수준)

- Claude API 키 없음/호출 실패 → AI 영역·챗봇에 "AI를 사용할 수 없어요" 안내, 나머지 기능 정상 동작
- 알라딘 API 실패 → 시드 스크립트는 에러 출력 후 중단, 런타임 검색은 빈 결과 + 안내
- 대출 규칙 위반(이미 대출 중 등) → 409 + 한국어 메시지, 프론트는 토스트로 표시

## 9. 테스트

- Vitest 단위 테스트: `loanService`의 대출/반납/예약 규칙 (재고 1권, 예약자 우선, 중복 방지)
- AI·화면은 수동 확인 (하루 일정)

## 10. 시드 데이터

`scripts/seed.ts` (`npm run seed`):

1. 알라딘 ItemList API로 카테고리 4~5개(경제경영, IT, 자기계발, 인문 등) 베스트셀러 수집 → 책 40권 내외
2. 가짜 직원 8명 (이름 + 부서)
3. 데모 리얼리티용: 대출 몇 건(일부 연체 포함), 리뷰 10여 건, 예약 1~2건
