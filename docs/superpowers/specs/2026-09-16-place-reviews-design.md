# 장소 후기(태그 칩) 설계 — 2026-09-16

## 배경

`/places`의 카페·도서관·공원은 카카오 로컬 검색 결과다. "카카오 리뷰를 임베딩할 수 없나"에서 출발했지만 카카오는 리뷰 API·임베드 위젯을 제공하지 않는다(응답 필드에 평점·후기 없음, [[../../decisions/2026-09-16-장소-후기-자체구현|결정]]). 대신 **사내 구성원이 "책 읽기 좋은 자리"로서 남기는 자체 후기**를 만든다. 입력은 5초, 형식은 태그 칩 + 선택적 한 줄.

## 범위

- 장소 카드 안에서 후기 집계 보기 · 내 후기 남기기/수정/삭제. 그게 전부다.
- **안 한다**: 별점, 후기 추천/좋아요, 별도 모아보기 페이지, 사진, 관리자 삭제, 내 서재 연동.

## 태그 세트 (`shared/constants/placeTags.ts`)

| code | label |
|---|---|
| `quiet` | 조용해요 |
| `outlet` | 콘센트 있어요 |
| `spacious` | 자리 넓어요 |
| `long-stay` | 오래 있기 좋아요 |
| `bright` | 채광 좋아요 |
| `noisy` | 시끄러워요 |

`PLACE_TAGS: readonly { code, label }[]`, `PlaceTagCode` 유니온, `isPlaceTagCode(x)` 가드. DB에는 code만 저장하고 라벨은 상수에서 읽는다.

## 데이터

```sql
CREATE TABLE IF NOT EXISTS place_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kakao_place_id TEXT NOT NULL,          -- 카카오 로컬 검색 응답의 id (안정 키)
  place_name TEXT NOT NULL,              -- 저장 시점 스냅샷 (나중에 카카오 재조회 없이 이름 표시용)
  user_id INTEGER NOT NULL REFERENCES users(id),
  tags TEXT NOT NULL,                    -- JSON 배열, 코드 1~6개, 중복 없음
  comment TEXT NOT NULL DEFAULT '',      -- 80자 이내, 빈 값 허용
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kakao_place_id, user_id));      -- 1인 1후기
```

- `migrate.ts`에 `CREATE TABLE IF NOT EXISTS` 추가.
- `scripts/seed.ts` `resetAll`의 삭제 순서에 `place_reviews`를 `review_votes` 앞에 추가(users FK). `scripts/guest-seed.ts --remove`의 DELETE 목록에도 추가.

## 타입 (`shared/types/index.ts`)

- `Place`에 `kakaoId?: string`, `placeUrl?: string` 추가. `kakaoLocalService.toPlace()`가 `raw.id`·`raw.place_url`을 채운다. 폴백 예시 4곳은 둘 다 없음 → 후기 UI를 숨긴다.
- 새 타입:

```ts
export interface PlaceReview {
  id: number; kakaoPlaceId: string; placeName: string; userId: number
  userName: string; department: string
  tags: PlaceTagCode[]; comment: string; createdAt: string; updatedAt: string
}
export interface PlaceReviewSummary {
  kakaoPlaceId: string
  total: number
  tagCounts: Partial<Record<PlaceTagCode, number>>   // 0인 태그는 생략
  recent: Pick<PlaceReview, 'id' | 'userName' | 'department' | 'comment' | 'createdAt'>[]  // comment가 비어있지 않은 최근 2건
  mine: Pick<PlaceReview, 'tags' | 'comment'> | null
}
```

## 서버

**`server/utils/placeReview.ts`** — `parsePlaceReviewInput(body): { placeName, tags, comment }` 순수 함수.
- `placeName`: 문자열 trim, 필수, 100자.
- `tags`: 배열, 각 원소 `isPlaceTagCode`, 중복 제거 후 1개 이상. 아니면 400 `태그를 하나 이상 골라주세요` / `알 수 없는 태그예요`.
- `comment`: 문자열이면 trim, 아니면 `''`. 80자 초과 400 `한 줄 후기는 80자 이내로 적어주세요`.
- `kakaoPlaceId` 라우트 파라미터: `/^\d{1,20}$/` 아니면 400.

**`server/repositories/placeReviewRepo.ts`**
- `upsert(kakaoPlaceId, userId, input): PlaceReview` — `INSERT ... ON CONFLICT(kakao_place_id, user_id) DO UPDATE SET place_name, tags, comment, updated_at = datetime('now')`.
- `findMine(kakaoPlaceId, userId): PlaceReview | undefined`
- `remove(kakaoPlaceId, userId): boolean` — 지운 행 수 > 0.
- `summaryByIds(ids: string[], meId: number): PlaceReviewSummary[]` — ids 최대 30개. 한 번에 해당 장소의 후기 전체를 읽어 JS에서 집계(장소당 후기 수가 작아 SQL 집계보다 단순). 요청한 id 중 후기 0건인 장소도 `total: 0`으로 포함.

**API**
- `GET /api/place-reviews?ids=a,b,c` → `PlaceReviewSummary[]`. 로그인 필요. ids 없거나 비면 `[]`. 형식 안 맞는 id는 무시. 30개 초과 시 앞 30개.
- `PUT /api/place-reviews/[kakaoId]` → `201`·`PlaceReview`(upsert). 로그인 필요(게스트 포함).
- `DELETE /api/place-reviews/[kakaoId]` → `204`. 내 후기가 없으면 404 `남긴 후기가 없어요`.

## UI

**`app/components/reading/PlaceReviewPanel.vue`** — props `{ place: Place, summary: PlaceReviewSummary | null }`, emit `changed(summary)`. `place.kakaoId`가 없으면 아무것도 그리지 않는다. places.vue는 목록을 받은 뒤 `kakaoId`가 있는 장소 id들로 `GET /api/place-reviews`를 한 번 불러 `Map<kakaoId, summary>`를 만들고 카드마다 넘긴다.

접힌 상태(기본):
- 집계 칩: `tagCounts`를 많은 순으로 최대 3개, `조용해요 4` 형태. `total === 0`이면 `아직 후기가 없어요 — 첫 후기를 남겨보세요`.
- 최근 코멘트 최대 2줄: `"창가 자리 좋아요" — 김민우 · 개발팀`.
- 우측에 텍스트 버튼 `후기 남기기` / 내 후기가 있으면 `내 후기 수정`.

펼친 상태(버튼 클릭, 카드 안 인라인, 모달·페이지 이동 없음):
- 칩 6개 토글(`aria-pressed`). 선택 시 레드 포인트(`--red` 테두리·`--red-tint` 배경·`--red-text` 글자) — 레드는 포인트로만.
- 한 줄 입력 `한 줄 후기 (선택)`, `maxlength=80`, 글자 수 표시.
- `저장` (태그 0개면 비활성) · `취소` · 내 후기가 있으면 `삭제`(confirm 한 번).
- 저장/삭제 성공 시 `GET /api/place-reviews?ids=<이 장소>`로 그 장소 요약만 다시 받아 `changed`로 올리고 접는다. 실패는 `alert(apiErrorMessage(e))` (기존 패턴).

**`app/pages/places.vue`**
- `v-for`의 `:key`를 `place.kakaoId ?? place.name`으로.
- `.acts`의 "카카오맵에서 보기"는 `placeUrl`이 있으면 그걸(장소 상세 페이지, 카카오 리뷰가 거기 있다), 없으면 기존 좌표 링크.
- `.acts` 아래에 `<ReadingPlaceReviewPanel>`.
- 검색/사업장 변경으로 목록이 바뀌면 요약도 다시 조회.

## 테스트 (vitest, `initDb(':memory:')` 패턴)

- `tests/placeReviewInput.test.ts` — 정상 입력 정규화(중복 태그 제거·trim), 태그 0개 400, 모르는 태그 400, 코멘트 81자 400, 코멘트 생략 시 `''`, placeName 없음 400.
- `tests/placeReviewRepo.test.ts` — 같은 (장소, 사용자) 두 번 upsert하면 행 1개·내용 갱신; `summaryByIds`가 tagCounts·total·recent(코멘트 있는 것만, 최신 2건)·mine을 맞게 채우고 후기 없는 id도 `total 0`으로 돌려준다; `remove`는 내 것만 지운다.
- `tests/mergeRanking.test.ts` 옆에 `kakaoLocalService` `toPlace` 케이스는 export되지 않으므로, `search`를 `fetch` 모킹으로 한 번 호출해 `kakaoId`·`placeUrl`이 채워지는지 확인(`tests/kakaoLocalPlace.test.ts`).
