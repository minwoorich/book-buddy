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
- 리뷰: 별점(1~5) + 한줄 리뷰 + 리뷰 추천(👍 사용자당 리뷰별 1회, 추천 수 표시)
- 플로팅 AI 챗봇: 추천·검색·요약·Q&A + 도구 실행(대출/예약/신청) + 네비게이션 버튼 제안
- 이름 선택 로그인 (비밀번호 없음)
- **도서 달력**: 반납(완독)한 날에 그 책의 표지가 달력에 등록되는 월간 뷰
- **책쌓기**: 완독(반납)한 책이 책 무더기처럼 쌓이는 시각화 (북적북적 스타일).
  페이지 진행률 추적은 하지 않는다 — 구독 서비스가 아니라 몇 쪽 읽었는지 알 수 없음 (민우 결정)
- **마이페이지 책장**: 읽은 책 / 읽고 있는 책 / 찜한 책을 실제 책장 선반에 꽂힌 느낌으로 표시
- **사내 독서 랭킹 보드**: 개인별 · 팀별 · 부서별 · 계열사별 랭킹 (완독 권수/페이지 기준)
- **커뮤니티 피드**: 인스타그램식 사진 업로드 + 좋아요 + 댓글 (책 태그 가능)
- **책 읽기 좋은 장소**: 네이버 지도 연동 + AI 추천 (주변 카페·도서관·공원을 AI가 큐레이션)
- **관리자 대시보드**: 대출/반납 현황·연체 관리, 희망도서 신청 처리, 신고 처리, 책 등록/삭제
- **통계**: 부서별 · 성별 · 나이대별 · 직급별 · 계열사별 · 팀별 독서 활동 차트

비범위(명시적 제외): 실제 인증/보안, 다중 재고 수량 관리, 연체 제재, 알림.

## 2. 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Nuxt 3 (프론트 + Nitro 서버 라우트 단일 앱) |
| 언어 | **전부 TypeScript** — 서버·프론트·스크립트 모두 `.ts` / `<script setup lang="ts">`, 순수 `.js` 파일 금지 |
| DB | SQLite (better-sqlite3), 파일 1개 |
| AI | Claude API — LangChain.js (`@langchain/anthropic`, `@langchain/core`, `@langchain/langgraph`의 `createReactAgent`) |
| 모델 | `claude-sonnet-5` |
| 외부 데이터 | 알라딘 Open API (TTB 키, `.env`) — 시드 수집 + 희망도서 검색 |
| 테스트 | Vitest — 대출/예약 비즈니스 규칙 단위 테스트만 (데모 수준) |

환경변수(`.env`): `ANTHROPIC_API_KEY`, `ALADIN_TTB_KEY`,
`NAVER_MAP_CLIENT_ID`(네이버클라우드 Maps), `NAVER_SEARCH_CLIENT_ID`/`NAVER_SEARCH_CLIENT_SECRET`(네이버 개발자센터 지역검색)

> 주의: 네이버 **지도(NCP Maps)**와 **지역검색(개발자센터)**은 발급처가 다른 별개 키다.

## 3. 프로젝트 구조 (레이어 분리)

한 파일에 몰아넣지 않는다. 각 레이어는 단방향으로만 의존한다:
`api → service → repository → db`, `ai tools → service/repository`.
전부 TypeScript. 도메인 타입은 `shared/`에 두고 서버·프론트가 공유한다.

```
shared/
  types/           # 도메인 타입 (Book, Loan, User, Post, ...) — 서버·프론트 공용
server/
  db/              # 커넥션 싱글턴, 스키마 생성(migrate.ts)
  repositories/    # 테이블별 CRUD — 1테이블 1파일
                   # (books, users, loans, reservations, purchaseRequests,
                   #  reviews, reviewVotes, wishlists, readingProgress,
                   #  posts, postLikes, postComments, reports)
  services/        # 비즈니스 규칙 — loanService(대출/반납/예약 규칙),
                   # rankingService, statsService, uploadService,
                   # aladinService, naverPlaceService
  ai/
    agent.ts       # LangGraph ReAct 에이전트 구성
    tools/         # LangChain tool 정의 (도구 1개 = 파일 1개)
    prompts.ts     # 시스템 프롬프트
  api/             # RESTful 라우트 — Nitro 파일 라우팅으로 자원/메서드별 1파일
                   # (예: books/index.get.ts, books/[id].get.ts, loans/index.post.ts)
  utils/           # requireUser(x-user-id 해석), requireAdmin, ApiError
app/ (Nuxt)
  pages/           # login, index, books/[id], my, calendar, rankings,
                   # feed, places, admin/index, admin/stats
  components/      # 도메인별 폴더로 분리
    book/          # BookCard, BookShelf(선반), CoverImage, StatusBadge
    ai/            # AiSearchPanel, ChatWidget, ChatMessage, ActionButtons
    review/        # ReviewList, ReviewForm, StarRating
    reading/       # BookStack(책쌓기), ProgressForm, ReadingCalendar
    feed/          # PostCard, PostComposer, CommentList
    admin/         # StatCards, LoanTable, RequestTable, ReportTable, StatsChart
    common/        # AppHeader, SearchBar, CategoryChips, Toast
  composables/     # useCurrentUser(localStorage), useApi($fetch 래퍼, x-user-id 자동 첨부), useChat
scripts/
  seed.ts          # 알라딘 API → 책 + 직원 + 데모 활동 데이터 삽입
tests/             # Vitest — loanService 등 핵심 규칙
```

## 4. 데이터 모델

| 테이블 | 주요 컬럼 |
|---|---|
| `users` | id, name, company(계열사), department(부서), team(팀), position(직급), gender, birth_year, role(admin/member) |
| `books` | id, isbn13, title, author, publisher, category, description, cover_url, pub_date, page_count |
| `loans` | id, book_id, user_id, loaned_at, due_at(14일), returned_at(null=대출중) |
| `reservations` | id, book_id, user_id, created_at, status(waiting/canceled/fulfilled) |
| `purchase_requests` | id, user_id, title, author, isbn13, cover_url, reason, created_at, status(requested) |
| `reviews` | id, book_id, user_id, rating(1~5), content(한줄), created_at |
| `review_votes` | id, review_id, user_id, created_at — (review_id, user_id) 유니크로 중복 추천 방지 |
| `wishlists` | id, user_id, book_id, created_at — (user_id, book_id) 유니크. "찜" |
| `posts` | id, user_id, book_id(선택, 책 태그), image_path, caption, created_at — 커뮤니티 피드 |
| `post_likes` | id, post_id, user_id, created_at — (post_id, user_id) 유니크 |
| `post_comments` | id, post_id, user_id, content, created_at |
| `reports` | id, reporter_id, target_type(book/post/review), target_id, reason, status(pending/resolved), created_at — 분실·파손·부적절 게시물 신고 |

사진 업로드는 로컬 디스크(`.data/uploads/`)에 저장하고 Nitro 라우트로 서빙 (데모 수준, 외부 스토리지 없음).

파생 규칙 (별도 테이블 없음):

- **읽은 책** = 반납 완료된 대출(returned_at not null). 반납 = 완독으로 간주 (느슨)
- **읽고 있는 책** = 현재 대출 중인 책 (returned_at null)
- **도서 달력** = 반납일(returned_at) 기준으로 loans를 월별 조회해 표지 표시
- **랭킹·책쌓기·통계는 전부 대출-반납 기록만 기준** (민우 결정: "무조건 대출 반납 기록 기준으로 카운팅").
  기간 내 반납 완료 **권수**로 카운트, 동률은 공동 순위. 페이지 수는 집계·표시하지 않는다.
  팀/부서/계열사 랭킹은 users의 소속 필드로 그룹핑

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
| `GET /api/books/:id/reviews` | 리뷰 목록 (추천 수 `voteCount`, 내 추천 여부 `votedByMe` 포함) |
| `POST /api/books/:id/reviews` | 리뷰 작성 `{rating, content}` |
| `POST /api/reviews/:id/votes` | 리뷰 추천 (사용자당 1회, 중복 시 409) |
| `DELETE /api/reviews/:id/votes` | 내 리뷰 추천 취소 |
| `GET /api/loans?userId=&active=` | 대출 목록 (내 서재) |
| `POST /api/loans` | 대출 `{bookId}` |
| `PATCH /api/loans/:id` | 반납 `{returned: true}` |
| `GET /api/reservations?userId=` | 내 예약 목록 |
| `POST /api/reservations` | 예약 `{bookId}` |
| `DELETE /api/reservations/:id` | 예약 취소 |
| `GET /api/purchase-requests?userId=` | 내 구매 신청 목록 |
| `POST /api/purchase-requests` | 구매 신청 (알라딘 검색 결과 기반) |
| `GET /api/wishlists?userId=` | 내 찜 목록 |
| `POST /api/wishlists` | 찜하기 `{bookId}` (중복 시 409) |
| `DELETE /api/wishlists/:id` | 찜 해제 |
| `GET /api/loans?userId=&returned=true&from=&to=` | 도서 달력·책쌓기용 — 기간 내 반납 완료 대출 (기존 loans 엔드포인트 재사용) |
| `GET /api/rankings?by=user\|team\|department\|company&period=month\|all` | 사내 독서 랭킹 |
| `GET /api/posts` / `POST /api/posts` | 피드 목록 / 게시물 작성 (multipart: 사진 + 캡션 + 책 태그) |
| `POST /api/posts/:id/likes` / `DELETE /api/posts/:id/likes` | 좋아요 / 취소 (사용자당 1회) |
| `GET /api/posts/:id/comments` / `POST /api/posts/:id/comments` | 댓글 목록 / 작성 |
| `GET /api/places?query=` | 네이버 지역검색 프록시 (주변 카페·도서관·공원) |
| `POST /api/ai/places` | 장소 목록을 Claude가 "책 읽기 좋은 순"으로 큐레이션 (추천 이유 포함) |
| `GET /api/aladin/search?query=` | 알라딘 도서 검색 프록시 (희망도서·책 등록용) |
| `POST /api/reports` | 신고 접수 `{targetType, targetId, reason}` |

**관리자 전용** (role=admin 헤더 검사, 데모 수준):

| 메서드/경로 | 설명 |
|---|---|
| `POST /api/books` | 책 등록 (알라딘 검색 결과 기반) |
| `DELETE /api/books/:id` | 책 삭제 |
| `GET /api/loans?active=true&overdue=true` | 전체 대출/연체 현황 (기존 엔드포인트 + 관리자면 전체 조회) |
| `PATCH /api/purchase-requests/:id` | 희망도서 신청 처리 `{status: approved\|rejected}` (승인 시 책 등록 연계) |
| `GET /api/reports?status=` / `PATCH /api/reports/:id` | 신고 목록 / 처리 |
| `GET /api/stats?by=department\|gender\|age\|position\|company\|team&period=` | 그룹별 독서 통계 (대출·완독·인당 평균) |
| `POST /api/ai/search` | 메인 페이지 AI 검색 (단발 질의) |
| `POST /api/ai/chat` | 챗봇 대화 (메시지 히스토리 포함, 스테이트리스) |

AI 두 개는 자원형이 아닌 RPC성 엔드포인트로 예외 인정.

## 6. AI 에이전트 설계

LangGraph `createReactAgent` + Claude로 서버에서 도구 실행 루프를 돈다.
챗봇과 AI 검색이 **같은 에이전트 구성을 재사용**하되, AI 검색은 히스토리 없는 단발 호출.

도구 (1도구 1파일, service/repository 재사용):

- 조회: `search_books`, `get_book_detail`, `get_my_loans`, `get_reviews`, `search_aladin`, `get_my_reading_stats`(대출-반납 기반 완독 통계), `get_rankings`
- 행동: `borrow_book`, `return_book`, `reserve_book`, `request_purchase`, `add_wishlist`

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
   리뷰 목록(추천 수 순 정렬, 👍 추천 버튼 — 내가 누른 리뷰는 활성 표시) + 작성 폼
   (`?review=1`이면 폼 자동 포커스), "AI에게 이 책 물어보기" 버튼
4. `/my` (내 서재 = 마이페이지) — **책장 메타포**: 읽은 책 / 읽고 있는 책 / 찜한 책이
   각각 책장 선반에 꽂힌 형태로 표시 (표지가 선반 위에 서 있음). 상단에 **책쌓기 위젯**
   (완독한 책이 책 더미로 쌓이는 시각화 — 반납 기록 기준, 페이지 진행률 없음).
   읽고 있는 책에는 대출일·반납 기한(D-day)만 표시. 예약·구매 신청 목록과 반납 버튼도 여기에
5. `/calendar` (도서 달력) — 월간 달력 그리드. 반납(완독)한 날짜 칸에 그 책의 표지
   썸네일이 붙음. 월 이동 가능, 표지 클릭 시 책 상세로
6. `/rankings` (독서 랭킹) — 탭: 개인 / 팀 / 부서 / 계열사. 기간 필터(이달/전체).
   **반납 완료 권수만으로** 순위 산정·표시 (페이지 수 표기 없음), 상위 3위 강조
7. `/feed` (커뮤니티) — 인스타그램식 카드 피드: 사진 + 캡션 + 책 태그(표지 칩),
   좋아요(❤ 토글)와 댓글. 업로드 모달(사진 선택 + 캡션 + 읽던 책 태그)
8. `/places` (책 읽기 좋은 장소) — 네이버 지도(마커) + 사이드 장소 리스트.
   "AI 추천받기" 버튼 → 검색된 장소들을 Claude가 책 읽기 좋은 순으로 정렬 + 한줄 추천 이유.
   지도 키가 없으면 리스트만 표시 (지도 영역에 안내)
9. `/admin` (관리자 대시보드, role=admin만) — 상단 요약 카드(대출 중/연체/신청 대기/신고 대기),
   최근 대출·반납 테이블(강제 반납 처리 버튼), 희망도서 신청 승인/거절,
   신고 처리 목록, 책 등록(알라딘 검색 → 추가)/삭제
10. `/admin/stats` (통계) — 그룹 기준 선택(부서/성별/나이대/직급/계열사/팀) + 기간 필터.
    그룹별 대출·완독량 막대 차트, 인당 평균 표기 (차트는 라이브러리 없이 CSS/SVG 막대)
11. **플로팅 챗봇** — 우하단 호버링 버튼. **로그인 상태에서만 렌더링** (비로그인 화면에는 없음)

## 8. 에러 처리 (데모 수준)

- Claude API 키 없음/호출 실패 → AI 영역·챗봇에 "AI를 사용할 수 없어요" 안내, 나머지 기능 정상 동작
- 알라딘 API 실패 → 시드 스크립트는 에러 출력 후 중단, 런타임 검색은 빈 결과 + 안내
- 대출 규칙 위반(이미 대출 중 등) → 409 + 한국어 메시지, 프론트는 토스트로 표시

## 9. 테스트

- Vitest 단위 테스트: `loanService`의 대출/반납/예약 규칙 (재고 1권, 예약자 우선, 중복 방지)
- AI·화면은 수동 확인 (하루 일정)

## 10. 디자인 방향 (확정)

`design/mockups/ver1a-editorial.html`이 스타일 가이드다 — **에디토리얼 서재**:

- 크림톤 배경(#F8F4ED) + 세리프 헤드라인(Noto Serif KR) + 본문 Pretendard
- VATECH red #E60012는 포인트 전용 (버튼, 액티브, 로고, AI 라벨). 넓은 면적 금지
- 책 표지는 실제 이미지(알라딘 cover500), 책등 하이라이트 + 그림자로 실물감
- 서가/책장 화면은 나무 선반 위에 표지가 서 있는 연출 (마이페이지 책장, 이달의 서가)

## 11. 배포 전략

1일 데모 기준으로 단순하게 간다:

- **1차(데모 당일)**: 로컬 실행 — `npm run dev` 또는 `npm run build && node .output/server/index.mjs`.
  시연자는 본인 노트북에서 실행하고 화면 공유/빔프로젝터로 시연
- **2차(원하면)**: **Dockerfile 제공** — Nitro node-server 프리셋 빌드 산출물(`.output`) +
  SQLite 파일과 업로드 폴더(`.data/`)를 볼륨 마운트. 사내 VM 어디서든 `docker run`
- **서버리스(Vercel 등) 배포는 안 함** — SQLite 파일 DB와 로컬 사진 업로드가
  서버리스 파일시스템과 맞지 않음. 단일 Node 서버 전제
- `.env`(API 키들)는 이미지에 굽지 않고 런타임에 주입. 시드는 배포 후 `npm run seed` 1회

## 12. 시드 데이터

`scripts/seed.ts` (`npm run seed`):

1. 알라딘 ItemList API로 카테고리 4~5개(경제경영, IT, 자기계발, 인문 등) 베스트셀러 수집 → 책 40권 내외 (page_count는 ItemLookUp subinfo에서)
2. 가짜 직원 12명 내외 — **계열사 2~3개 × 부서 × 팀** 구성, 성별·출생연도·직급 분산 배치
   (랭킹 보드·통계가 그럴듯해야 함). 그중 1명은 role=admin (도서관리자)
3. 데모 리얼리티용: **반납 완료 대출 여러 건(달력·랭킹·읽은 책이 채워지도록 날짜 분산)**, 진행 중 대출 몇 건, 찜 몇 건, 리뷰 10여 건 + 리뷰 추천 몇 건, 예약 1~2건
4. 커뮤니티 피드 게시물 4~5건 (사진은 책 표지 이미지로 대체) + 좋아요·댓글 몇 건
