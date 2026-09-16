# 장소 후기(태그 칩) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/places`의 각 장소 카드 안에서 사내 구성원이 태그 칩(+선택적 한 줄)으로 "책 읽기 좋은 자리" 후기를 남기고 집계를 볼 수 있게 한다.

**Architecture:** 카카오 로컬 검색 응답의 `id`를 안정 키(`Place.kakaoId`)로 살려 `place_reviews` 테이블(1인 1후기, upsert)에 저장한다. 목록 화면은 장소 id 묶음으로 요약을 한 번에 받아(`GET /api/place-reviews?ids=`) 카드마다 `PlaceReviewPanel`에 넘기고, 패널은 카드 안에서 인라인으로 펼쳐져 저장/수정/삭제한다.

**Tech Stack:** Nuxt 4 (SPA, `ssr:false`) + Vue 3 `<script setup lang="ts">`, Nitro API(h3), better-sqlite3, vitest. 인증은 `x-user-id`(+게스트 `x-guest-token`) 헤더 — `requireUser(event)`.

**Spec:** `docs/superpowers/specs/2026-09-16-place-reviews-design.md`

## Global Constraints

- 모든 코드는 TypeScript. 순수 `.js` 금지.
- 레드(`--red` #E60012)는 포인트로만(선택된 칩 테두리·버튼). 넓은 면적에 깔지 않는다.
- 사용자 문구는 기존 톤: "~해요/~해주세요" 존댓말, 이모지 없음.
- API 핸들러는 `handleApi(...)` 래퍼 + `ApiError(status, message)` 패턴. 입력 검증은 `server/utils/*.ts`의 순수 함수.
- 테스트는 `tests/*.test.ts`, `initDb(':memory:')`로 격리. 실행: `npx vitest run <file>`.
- 커밋 메시지는 한국어 `feat:`/`test:`/`docs:` 접두, 마지막 줄 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nuxt 컴포넌트 자동 임포트: `app/components/reading/PlaceReviewPanel.vue` → 템플릿에서 `<ReadingPlaceReviewPanel>`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `shared/constants/placeTags.ts` (신규) | 태그 6종 코드·라벨, `PlaceTagCode`, `isPlaceTagCode` |
| `shared/types/index.ts` (수정) | `Place.kakaoId/placeUrl`, `PlaceReview`, `PlaceReviewSummary` |
| `server/services/kakaoLocalService.ts` (수정) | `toPlace()`가 `id`·`place_url` 매핑 |
| `server/db/migrate.ts` (수정) | `place_reviews` 테이블 |
| `scripts/seed.ts`, `scripts/guest-seed.ts` (수정) | 리셋/게스트 삭제 목록에 `place_reviews` |
| `server/utils/placeReview.ts` (신규) | `parsePlaceReviewInput`, `parseKakaoPlaceId` |
| `server/repositories/placeReviewRepo.ts` (신규) | upsert / findMine / remove / summaryByIds |
| `server/api/place-reviews/index.get.ts` (신규) | 요약 일괄 조회 |
| `server/api/place-reviews/[kakaoId].put.ts` (신규) | 내 후기 upsert |
| `server/api/place-reviews/[kakaoId].delete.ts` (신규) | 내 후기 삭제 |
| `app/components/reading/PlaceReviewPanel.vue` (신규) | 카드 안 집계 + 인라인 작성 폼 |
| `app/pages/places.vue` (수정) | 요약 일괄 조회, 패널 삽입, `placeUrl` 링크 |
| `tests/kakaoLocalPlace.test.ts`, `tests/placeReviewInput.test.ts`, `tests/placeReviewRepo.test.ts` (신규) | 단위 테스트 |

---

### Task 1: 태그 상수 + Place 타입 확장 + 카카오 id/place_url 매핑

**Files:**
- Create: `shared/constants/placeTags.ts`
- Modify: `shared/types/index.ts` (Place 인터페이스, 약 223행)
- Modify: `server/services/kakaoLocalService.ts` (`KakaoLocalRawItem`, `toPlace`)
- Test: `tests/kakaoLocalPlace.test.ts`

**Interfaces:**
- Produces: `PLACE_TAGS: readonly { code: PlaceTagCode; label: string }[]`, `type PlaceTagCode`, `isPlaceTagCode(v: unknown): v is PlaceTagCode`, `PLACE_TAG_LABEL: Record<PlaceTagCode, string>`; `Place.kakaoId?: string`, `Place.placeUrl?: string`.

- [ ] **Step 1: 태그 상수 작성**

`shared/constants/placeTags.ts`:

```ts
/**
 * 장소 후기 태그 6종. DB에는 code만 저장하고 라벨은 여기서 읽는다.
 * 마지막 `noisy`는 부정 태그 — 솔직한 신호를 남길 수 있게 하나 둔다.
 */
export const PLACE_TAGS = [
  { code: 'quiet', label: '조용해요' },
  { code: 'outlet', label: '콘센트 있어요' },
  { code: 'spacious', label: '자리 넓어요' },
  { code: 'long-stay', label: '오래 있기 좋아요' },
  { code: 'bright', label: '채광 좋아요' },
  { code: 'noisy', label: '시끄러워요' },
] as const

export type PlaceTagCode = (typeof PLACE_TAGS)[number]['code']

export const PLACE_TAG_LABEL: Record<PlaceTagCode, string> = Object.fromEntries(
  PLACE_TAGS.map((t) => [t.code, t.label])
) as Record<PlaceTagCode, string>

const CODE_SET: ReadonlySet<string> = new Set(PLACE_TAGS.map((t) => t.code))

export function isPlaceTagCode(value: unknown): value is PlaceTagCode {
  return typeof value === 'string' && CODE_SET.has(value)
}
```

- [ ] **Step 2: Place 타입 확장 + 후기 타입 추가**

`shared/types/index.ts`의 `Place` 인터페이스를 다음으로 교체하고, 바로 아래에 후기 타입을 추가한다. 파일 맨 위 import에 `import type { PlaceTagCode } from '../constants/placeTags'`를 넣는다(기존 import 스타일 확인 — 이 파일에 import가 없으면 첫 줄에 추가).

```ts
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
  /** 요청한 사용자의 후기. 없으면 null. */
  mine: Pick<PlaceReview, 'tags' | 'comment'> | null
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/kakaoLocalPlace.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { kakaoLocalService } from '../server/services/kakaoLocalService'

const RAW = {
  documents: [
    {
      id: '78911659',
      place_name: '청수당 베이커리',
      category_name: '음식점 > 카페 > 디저트카페',
      road_address_name: '서울 종로구 돈화문로11나길 31-9',
      address_name: '서울 종로구 익선동 144',
      x: '126.98978471926921',
      y: '37.57388138546145',
      place_url: 'http://place.map.kakao.com/78911659',
      distance: '120',
    },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe('kakaoLocalService.search → Place 매핑', () => {
  it('카카오 id와 place_url을 kakaoId/placeUrl로 채운다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(RAW), { status: 200 })))
    const [place] = await kakaoLocalService.search('key', '카페', 1)
    expect(place).toMatchObject({
      name: '청수당 베이커리',
      category: '디저트카페',
      kakaoId: '78911659',
      placeUrl: 'http://place.map.kakao.com/78911659',
      distanceM: 120,
    })
  })

  it('id가 비어 있으면 kakaoId/placeUrl 키를 만들지 않는다', async () => {
    const noId = { documents: [{ ...RAW.documents[0], id: '', place_url: '' }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(noId), { status: 200 })))
    const [place] = await kakaoLocalService.search('key', '카페', 1)
    expect(place).not.toHaveProperty('kakaoId')
    expect(place).not.toHaveProperty('placeUrl')
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run tests/kakaoLocalPlace.test.ts`
Expected: FAIL — `kakaoId` 없음(`expected ... to match object`).

- [ ] **Step 5: toPlace 매핑 구현**

`server/services/kakaoLocalService.ts`에서 `KakaoLocalRawItem`에 두 필드를 추가하고 `toPlace`를 고친다:

```ts
interface KakaoLocalRawItem {
  id?: string
  place_name?: string
  category_name?: string
  road_address_name?: string
  address_name?: string
  x?: string
  y?: string
  distance?: string
  place_url?: string
}
```

`toPlace` 반환 객체의 `...(distanceM)` 스프레드 아래에:

```ts
    // id는 장소 후기의 안정 키, place_url은 카카오맵 상세(리뷰가 있는 페이지) 링크.
    ...(raw.id ? { kakaoId: raw.id } : {}),
    ...(raw.place_url ? { placeUrl: raw.place_url } : {}),
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run tests/kakaoLocalPlace.test.ts tests/mergeRanking.test.ts`
Expected: PASS (mergeRanking은 회귀 확인).

- [ ] **Step 7: 커밋**

```bash
git add shared/constants/placeTags.ts shared/types/index.ts server/services/kakaoLocalService.ts tests/kakaoLocalPlace.test.ts
git commit -m "feat: 장소 후기 태그 상수 + Place.kakaoId/placeUrl 매핑

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: place_reviews 테이블 + 입력 검증

**Files:**
- Modify: `server/db/migrate.ts` (`notices` CREATE 다음)
- Modify: `scripts/seed.ts` (`resetAll`의 `tablesInDeleteOrder`), `scripts/guest-seed.ts` (`--remove` DELETE 목록)
- Create: `server/utils/placeReview.ts`
- Test: `tests/placeReviewInput.test.ts`

**Interfaces:**
- Consumes: `isPlaceTagCode`, `PlaceTagCode` (Task 1), `ApiError` (`server/utils/errors.ts`).
- Produces: `interface PlaceReviewInput { placeName: string; tags: PlaceTagCode[]; comment: string }`, `parsePlaceReviewInput(body: unknown): PlaceReviewInput`, `parseKakaoPlaceId(raw: unknown): string`.

- [ ] **Step 1: 테이블 추가**

`server/db/migrate.ts`의 첫 `db.exec` 문자열 안, `notices` CREATE 바로 뒤에:

```sql
    -- 장소 후기: 카카오 장소 id를 키로 태그 칩(JSON 코드 배열) + 선택적 한 줄. 1인 1후기(upsert).
    CREATE TABLE IF NOT EXISTS place_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kakao_place_id TEXT NOT NULL, place_name TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      tags TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kakao_place_id, user_id));
```

- [ ] **Step 2: 리셋 목록 갱신**

`scripts/seed.ts` `tablesInDeleteOrder`에서 `'review_votes'` 앞에 `'place_reviews',` 추가.
`scripts/guest-seed.ts`의 `db.exec` 블록에서 `DELETE FROM review_votes ...` 앞에 `DELETE FROM place_reviews WHERE user_id IN (${list});` 추가.

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/placeReviewInput.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parsePlaceReviewInput, parseKakaoPlaceId } from '../server/utils/placeReview'
import { ApiError } from '../server/utils/errors'

describe('parsePlaceReviewInput', () => {
  it('정상 입력을 정규화한다 — trim, 태그 중복 제거, 코멘트 생략 시 빈 문자열', () => {
    expect(
      parsePlaceReviewInput({ placeName: ' 카페 온점 ', tags: ['quiet', 'outlet', 'quiet'] })
    ).toEqual({ placeName: '카페 온점', tags: ['quiet', 'outlet'], comment: '' })
    expect(
      parsePlaceReviewInput({ placeName: '카페', tags: ['bright'], comment: '  창가 자리 좋아요 ' })
    ).toEqual({ placeName: '카페', tags: ['bright'], comment: '창가 자리 좋아요' })
  })

  it('장소 이름이 없으면 400', () => {
    expect(() => parsePlaceReviewInput({ tags: ['quiet'] })).toThrow(ApiError)
    expect(() => parsePlaceReviewInput({ placeName: '  ', tags: ['quiet'] })).toThrow('장소 이름')
  })

  it('태그가 없거나 배열이 아니면 400', () => {
    expect(() => parsePlaceReviewInput({ placeName: '카페', tags: [] })).toThrow('태그를 하나 이상')
    expect(() => parsePlaceReviewInput({ placeName: '카페', tags: 'quiet' })).toThrow('태그를 하나 이상')
  })

  it('모르는 태그 코드는 400', () => {
    expect(() => parsePlaceReviewInput({ placeName: '카페', tags: ['quiet', 'wifi'] })).toThrow('알 수 없는 태그')
  })

  it('코멘트 80자 초과는 400, 80자는 통과', () => {
    const ok = 'a'.repeat(80)
    expect(parsePlaceReviewInput({ placeName: '카페', tags: ['quiet'], comment: ok }).comment).toBe(ok)
    expect(() =>
      parsePlaceReviewInput({ placeName: '카페', tags: ['quiet'], comment: 'a'.repeat(81) })
    ).toThrow('80자')
  })
})

describe('parseKakaoPlaceId', () => {
  it('숫자 문자열만 통과시킨다', () => {
    expect(parseKakaoPlaceId('78911659')).toBe('78911659')
    expect(() => parseKakaoPlaceId('abc')).toThrow(ApiError)
    expect(() => parseKakaoPlaceId('')).toThrow(ApiError)
    expect(() => parseKakaoPlaceId(undefined)).toThrow(ApiError)
    expect(() => parseKakaoPlaceId('1'.repeat(21))).toThrow(ApiError)
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run tests/placeReviewInput.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 5: 검증 함수 구현**

`server/utils/placeReview.ts`:

```ts
import { ApiError } from './errors'
import { isPlaceTagCode, type PlaceTagCode } from '../../shared/constants/placeTags'

const PLACE_NAME_MAX = 100
const COMMENT_MAX = 80
const KAKAO_ID_RE = /^\d{1,20}$/

export interface PlaceReviewInput {
  placeName: string
  tags: PlaceTagCode[]
  comment: string
}

/** 장소 후기 작성·수정 본문 검증. 태그는 1개 이상(중복 제거), 한 줄 코멘트는 선택(80자). */
export function parsePlaceReviewInput(body: unknown): PlaceReviewInput {
  const b = (body ?? {}) as { placeName?: unknown; tags?: unknown; comment?: unknown }
  const placeName = typeof b.placeName === 'string' ? b.placeName.trim() : ''
  if (!placeName) throw new ApiError(400, '장소 이름이 필요해요')
  if (placeName.length > PLACE_NAME_MAX) throw new ApiError(400, `장소 이름은 ${PLACE_NAME_MAX}자 이내여야 해요`)

  const rawTags = Array.isArray(b.tags) ? b.tags : []
  const tags: PlaceTagCode[] = []
  for (const t of rawTags) {
    if (!isPlaceTagCode(t)) throw new ApiError(400, '알 수 없는 태그예요')
    if (!tags.includes(t)) tags.push(t)
  }
  if (tags.length === 0) throw new ApiError(400, '태그를 하나 이상 골라주세요')

  const comment = typeof b.comment === 'string' ? b.comment.trim() : ''
  if (comment.length > COMMENT_MAX) throw new ApiError(400, `한 줄 후기는 ${COMMENT_MAX}자 이내로 적어주세요`)

  return { placeName, tags, comment }
}

/** 라우트 파라미터의 카카오 장소 id — 숫자 문자열만 허용. */
export function parseKakaoPlaceId(raw: unknown): string {
  if (typeof raw !== 'string' || !KAKAO_ID_RE.test(raw)) throw new ApiError(400, '잘못된 장소 id예요')
  return raw
}
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run tests/placeReviewInput.test.ts tests/db.test.ts`
Expected: PASS (db.test는 migrate가 깨지지 않았는지 확인).

- [ ] **Step 7: 커밋**

```bash
git add server/db/migrate.ts scripts/seed.ts scripts/guest-seed.ts server/utils/placeReview.ts tests/placeReviewInput.test.ts
git commit -m "feat: place_reviews 테이블 + 장소 후기 입력 검증

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: placeReviewRepo (upsert / findMine / remove / summaryByIds)

**Files:**
- Create: `server/repositories/placeReviewRepo.ts`
- Test: `tests/placeReviewRepo.test.ts`

**Interfaces:**
- Consumes: `PlaceReviewInput` (Task 2), `PlaceReview`, `PlaceReviewSummary` (Task 1), `getDb()`.
- Produces:
  - `placeReviewRepo.upsert(kakaoPlaceId: string, userId: number, input: PlaceReviewInput): PlaceReview`
  - `placeReviewRepo.findMine(kakaoPlaceId: string, userId: number): PlaceReview | undefined`
  - `placeReviewRepo.remove(kakaoPlaceId: string, userId: number): boolean`
  - `placeReviewRepo.summaryByIds(ids: string[], meId: number): PlaceReviewSummary[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/placeReviewRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { placeReviewRepo } from '../server/repositories/placeReviewRepo'

function insertUser(name: string, department = '개발팀'): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year)
       VALUES (?, '바텍', ?, '플랫폼팀', '사원', 'M', 1996)`
    )
    .run(name, department)
  return Number(result.lastInsertRowid)
}

const CAFE = '78911659'
const PARK = '10001'

beforeEach(() => {
  initDb(':memory:')
})

describe('placeReviewRepo', () => {
  it('같은 (장소, 사용자)로 두 번 upsert하면 행은 1개, 내용은 갱신된다', () => {
    const me = insertUser('김민우')
    const first = placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '처음' })
    const second = placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['outlet', 'bright'], comment: '수정' })

    expect(second.id).toBe(first.id)
    expect(second).toMatchObject({ tags: ['outlet', 'bright'], comment: '수정', userName: '김민우', department: '개발팀' })
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM place_reviews').get() as { c: number }
    expect(count.c).toBe(1)
    expect(placeReviewRepo.findMine(CAFE, me)?.comment).toBe('수정')
  })

  it('summaryByIds — 태그 집계·총수·코멘트 있는 최근 2건·내 후기, 후기 없는 id도 total 0으로 돌려준다', () => {
    const me = insertUser('김민우')
    const a = insertUser('박지영', '디자인팀')
    const b = insertUser('이서준', '영업팀')
    placeReviewRepo.upsert(CAFE, a, { placeName: '카페', tags: ['quiet', 'outlet'], comment: '' })
    placeReviewRepo.upsert(CAFE, b, { placeName: '카페', tags: ['quiet'], comment: '창가 자리 좋아요' })
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet', 'noisy'], comment: '점심엔 시끄러움' })
    // updated_at 순서를 확정하기 위해 직접 세팅
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 10:00:00' WHERE user_id = ?`).run(b)
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 11:00:00' WHERE user_id = ?`).run(me)

    const [cafe, park] = placeReviewRepo.summaryByIds([CAFE, PARK], me)

    expect(cafe).toMatchObject({
      kakaoPlaceId: CAFE,
      total: 3,
      tagCounts: { quiet: 3, outlet: 1, noisy: 1 },
      mine: { tags: ['quiet', 'noisy'], comment: '점심엔 시끄러움' },
    })
    expect(cafe.tagCounts).not.toHaveProperty('bright')
    expect(cafe.recent.map((r) => r.comment)).toEqual(['점심엔 시끄러움', '창가 자리 좋아요'])
    expect(cafe.recent[0]).toMatchObject({ userName: '김민우', department: '개발팀' })

    expect(park).toEqual({ kakaoPlaceId: PARK, total: 0, tagCounts: {}, recent: [], mine: null })
  })

  it('recent는 코멘트 있는 것만 최대 2건', () => {
    const me = insertUser('김민우')
    for (let i = 0; i < 4; i++) {
      const u = insertUser(`사용자${i}`)
      placeReviewRepo.upsert(CAFE, u, { placeName: '카페', tags: ['quiet'], comment: `후기 ${i}` })
    }
    const [cafe] = placeReviewRepo.summaryByIds([CAFE], me)
    expect(cafe.total).toBe(4)
    expect(cafe.recent).toHaveLength(2)
    expect(cafe.mine).toBeNull()
  })

  it('remove는 내 것만 지우고, 없으면 false', () => {
    const me = insertUser('김민우')
    const other = insertUser('박지영')
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '' })
    placeReviewRepo.upsert(CAFE, other, { placeName: '카페', tags: ['quiet'], comment: '' })

    expect(placeReviewRepo.remove(CAFE, me)).toBe(true)
    expect(placeReviewRepo.remove(CAFE, me)).toBe(false)
    expect(placeReviewRepo.findMine(CAFE, me)).toBeUndefined()
    expect(placeReviewRepo.findMine(CAFE, other)).toBeDefined()
  })

  it('ids가 비면 빈 배열', () => {
    expect(placeReviewRepo.summaryByIds([], 1)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/placeReviewRepo.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 레포지토리 구현**

`server/repositories/placeReviewRepo.ts`:

```ts
import { getDb } from '../db/connection'
import type { PlaceReview, PlaceReviewSummary } from '../../shared/types'
import { isPlaceTagCode, type PlaceTagCode } from '../../shared/constants/placeTags'
import type { PlaceReviewInput } from '../utils/placeReview'

interface PlaceReviewRow {
  id: number
  kakao_place_id: string
  place_name: string
  user_id: number
  user_name: string
  department: string
  tags: string
  comment: string
  created_at: string
  updated_at: string
}

const SELECT = `SELECT r.*, u.name AS user_name, u.department AS department
                FROM place_reviews r JOIN users u ON u.id = r.user_id`

/** DB의 tags(JSON 문자열)를 코드 배열로. 깨진 값이나 모르는 코드는 조용히 버린다. */
function parseTags(raw: string): PlaceTagCode[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(isPlaceTagCode) : []
  } catch {
    return []
  }
}

function toPlaceReview(row: PlaceReviewRow): PlaceReview {
  return {
    id: row.id,
    kakaoPlaceId: row.kakao_place_id,
    placeName: row.place_name,
    userId: row.user_id,
    userName: row.user_name,
    department: row.department,
    tags: parseTags(row.tags),
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const RECENT_MAX = 2

export const placeReviewRepo = {
  /** 1인 1후기 — (kakao_place_id, user_id) 충돌 시 내용을 덮어쓴다. */
  upsert(kakaoPlaceId: string, userId: number, input: PlaceReviewInput): PlaceReview {
    getDb()
      .prepare(
        `INSERT INTO place_reviews (kakao_place_id, place_name, user_id, tags, comment)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kakao_place_id, user_id) DO UPDATE SET
           place_name = excluded.place_name, tags = excluded.tags, comment = excluded.comment,
           updated_at = datetime('now')`
      )
      .run(kakaoPlaceId, input.placeName, userId, JSON.stringify(input.tags), input.comment)
    return this.findMine(kakaoPlaceId, userId) as PlaceReview
  },

  findMine(kakaoPlaceId: string, userId: number): PlaceReview | undefined {
    const row = getDb()
      .prepare(`${SELECT} WHERE r.kakao_place_id = ? AND r.user_id = ?`)
      .get(kakaoPlaceId, userId) as PlaceReviewRow | undefined
    return row ? toPlaceReview(row) : undefined
  },

  /** 내 후기 삭제. 지운 행이 있으면 true. */
  remove(kakaoPlaceId: string, userId: number): boolean {
    const result = getDb()
      .prepare('DELETE FROM place_reviews WHERE kakao_place_id = ? AND user_id = ?')
      .run(kakaoPlaceId, userId)
    return result.changes > 0
  },

  /**
   * 장소 id 묶음의 후기 요약. 장소당 후기 수가 작아 SQL 집계 대신 전부 읽어 JS에서 센다.
   * 요청한 id 순서를 유지하고, 후기가 없는 id도 total 0으로 포함한다.
   */
  summaryByIds(ids: string[], meId: number): PlaceReviewSummary[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = getDb()
      .prepare(`${SELECT} WHERE r.kakao_place_id IN (${placeholders}) ORDER BY r.updated_at DESC, r.id DESC`)
      .all(...ids) as PlaceReviewRow[]

    const byPlace = new Map<string, PlaceReviewSummary>()
    for (const id of ids) {
      byPlace.set(id, { kakaoPlaceId: id, total: 0, tagCounts: {}, recent: [], mine: null })
    }
    for (const row of rows) {
      const summary = byPlace.get(row.kakao_place_id)
      if (!summary) continue
      const review = toPlaceReview(row)
      summary.total += 1
      for (const tag of review.tags) summary.tagCounts[tag] = (summary.tagCounts[tag] ?? 0) + 1
      if (review.comment && summary.recent.length < RECENT_MAX) {
        summary.recent.push({
          id: review.id,
          userName: review.userName,
          department: review.department,
          comment: review.comment,
          createdAt: review.createdAt,
        })
      }
      if (review.userId === meId) summary.mine = { tags: review.tags, comment: review.comment }
    }
    return ids.map((id) => byPlace.get(id) as PlaceReviewSummary)
  },
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/placeReviewRepo.test.ts`
Expected: PASS 5건.

- [ ] **Step 5: 커밋**

```bash
git add server/repositories/placeReviewRepo.ts tests/placeReviewRepo.test.ts
git commit -m "feat: placeReviewRepo — upsert·요약 집계·삭제

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: API 3종 (요약 조회 / upsert / 삭제)

**Files:**
- Create: `server/api/place-reviews/index.get.ts`
- Create: `server/api/place-reviews/[kakaoId].put.ts`
- Create: `server/api/place-reviews/[kakaoId].delete.ts`

**Interfaces:**
- Consumes: `placeReviewRepo` (Task 3), `parsePlaceReviewInput`, `parseKakaoPlaceId` (Task 2), `handleApi`, `requireUser`, `ApiError`.
- Produces (클라이언트가 의존):
  - `GET /api/place-reviews?ids=a,b,c` → `PlaceReviewSummary[]`
  - `PUT /api/place-reviews/:kakaoId` body `{ placeName, tags, comment? }` → `201` `PlaceReview`
  - `DELETE /api/place-reviews/:kakaoId` → `204`, 없으면 `404 남긴 후기가 없어요`

- [ ] **Step 1: 요약 조회 핸들러**

`server/api/place-reviews/index.get.ts`:

```ts
import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import type { PlaceReviewSummary } from '../../../shared/types'

const IDS_MAX = 30
const KAKAO_ID_RE = /^\d{1,20}$/

/** 장소 카드 목록용 후기 요약 일괄 조회. `?ids=a,b,c` — 형식 안 맞는 id는 무시, 최대 30개. */
export default defineEventHandler(
  handleApi((event): PlaceReviewSummary[] => {
    const me = requireUser(event)
    const raw = getQuery(event).ids
    const ids = (typeof raw === 'string' ? raw.split(',') : [])
      .map((s) => s.trim())
      .filter((s) => KAKAO_ID_RE.test(s))
    const unique = [...new Set(ids)].slice(0, IDS_MAX)
    return placeReviewRepo.summaryByIds(unique, me.id)
  })
)
```

- [ ] **Step 2: upsert 핸들러**

`server/api/place-reviews/[kakaoId].put.ts`:

```ts
import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import { parseKakaoPlaceId, parsePlaceReviewInput } from '../../utils/placeReview'

/** 내 장소 후기 작성/수정(1인 1후기 upsert). 게스트 포함 로그인 사용자 누구나. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const kakaoPlaceId = parseKakaoPlaceId(getRouterParam(event, 'kakaoId'))
    const input = parsePlaceReviewInput(await readBody(event))
    const review = placeReviewRepo.upsert(kakaoPlaceId, me.id, input)
    setResponseStatus(event, 201)
    return review
  })
)
```

- [ ] **Step 3: 삭제 핸들러**

`server/api/place-reviews/[kakaoId].delete.ts`:

```ts
import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import { parseKakaoPlaceId } from '../../utils/placeReview'

/** 내 장소 후기 삭제. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const kakaoPlaceId = parseKakaoPlaceId(getRouterParam(event, 'kakaoId'))
    if (!placeReviewRepo.remove(kakaoPlaceId, me.id)) throw new ApiError(404, '남긴 후기가 없어요')
    setResponseStatus(event, 204)
    return null
  })
)
```

- [ ] **Step 4: 빌드 + curl 스모크**

Run: `npm run build` → Expected: 성공(타입 에러 없음).

Run (빌드 서버, 별도 터미널에서 `node .output/server/index.mjs` 후; `x-user-id`는 로컬 DB의 실제 사용자 id — `1`이 보통 첫 사용자):

```bash
curl -s -X PUT localhost:3000/api/place-reviews/78911659 -H 'x-user-id: 1' -H 'content-type: application/json' \
  -d '{"placeName":"청수당 베이커리","tags":["quiet","outlet"],"comment":"창가 자리 좋아요"}'
# → 201, {"id":1,...,"tags":["quiet","outlet"]}
curl -s "localhost:3000/api/place-reviews?ids=78911659,10001" -H 'x-user-id: 1'
# → [{"kakaoPlaceId":"78911659","total":1,"tagCounts":{"quiet":1,"outlet":1},"recent":[...],"mine":{...}},{"kakaoPlaceId":"10001","total":0,...}]
curl -s -X PUT localhost:3000/api/place-reviews/78911659 -H 'x-user-id: 1' -H 'content-type: application/json' -d '{"placeName":"x","tags":[]}'
# → 400 "태그를 하나 이상 골라주세요"
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:3000/api/place-reviews/78911659 -H 'x-user-id: 1'   # 204
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:3000/api/place-reviews/78911659 -H 'x-user-id: 1'   # 404
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/place-reviews?ids=1"                                  # 401 (헤더 없음)
```

- [ ] **Step 5: 커밋**

```bash
git add server/api/place-reviews
git commit -m "feat: 장소 후기 API — 요약 일괄 조회·upsert·삭제

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: PlaceReviewPanel 컴포넌트 + places.vue 연결

**Files:**
- Create: `app/components/reading/PlaceReviewPanel.vue`
- Modify: `app/pages/places.vue` (script: 요약 조회 상태·함수, template: `:key`·`placeUrl` 링크·패널, style: 필요 시 카드 간격)

**Interfaces:**
- Consumes: `Place`, `PlaceReviewSummary` (Task 1), `PLACE_TAGS`, `PLACE_TAG_LABEL`, `PlaceTagCode` (Task 1), API 3종 (Task 4), `useApi`, `apiErrorMessage`, 전역 CSS `.chip`/`.chip.on`/`.btn`/`.btn.primary`/`.btn.sm`/`.input`.
- Produces: `<ReadingPlaceReviewPanel :place :summary @changed="(s) => ...">`.

- [ ] **Step 1: 컴포넌트 작성**

`app/components/reading/PlaceReviewPanel.vue`:

```vue
<script setup lang="ts">
import type { Place, PlaceReviewSummary } from '#shared/types'
import { PLACE_TAGS, PLACE_TAG_LABEL, type PlaceTagCode } from '#shared/constants/placeTags'

const props = defineProps<{
  place: Place
  /** 목록 화면이 일괄 조회해 넘긴 요약. 아직 안 왔으면 null. */
  summary: PlaceReviewSummary | null
}>()
const emit = defineEmits<{ changed: [summary: PlaceReviewSummary] }>()

const api = useApi()

const open = ref(false)
const selected = ref<PlaceTagCode[]>([])
const comment = ref('')
const saving = ref(false)

const COMMENT_MAX = 80
const TOP_TAGS = 3

/** 집계 칩: 많은 순 최대 3개. 동률은 태그 정의 순서. */
const topTags = computed(() => {
  const counts = props.summary?.tagCounts ?? {}
  return PLACE_TAGS.map((t) => ({ code: t.code, label: t.label, count: counts[t.code] ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TAGS)
})

const hasMine = computed(() => Boolean(props.summary?.mine))

function openForm() {
  selected.value = [...(props.summary?.mine?.tags ?? [])]
  comment.value = props.summary?.mine?.comment ?? ''
  open.value = true
}

function toggle(code: PlaceTagCode) {
  selected.value = selected.value.includes(code)
    ? selected.value.filter((c) => c !== code)
    : [...selected.value, code]
}

/** 저장/삭제 뒤 이 장소 요약만 다시 받아 부모에 올리고 접는다. */
async function refresh() {
  const [summary] = await api<PlaceReviewSummary[]>('/api/place-reviews', {
    query: { ids: props.place.kakaoId },
  })
  if (summary) emit('changed', summary)
  open.value = false
}

async function save() {
  if (selected.value.length === 0 || saving.value) return
  saving.value = true
  try {
    await api(`/api/place-reviews/${props.place.kakaoId}`, {
      method: 'PUT',
      body: { placeName: props.place.name, tags: selected.value, comment: comment.value.trim() },
    })
    await refresh()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (saving.value || !confirm('내 후기를 삭제할까요?')) return
  saving.value = true
  try {
    await api(`/api/place-reviews/${props.place.kakaoId}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- 카카오 id가 없는 장소(폴백 예시)는 후기를 붙일 키가 없다 -->
  <div v-if="place.kakaoId" class="prv">
    <div v-if="!open" class="prv-summary">
      <div class="prv-line">
        <template v-if="summary && summary.total > 0">
          <span v-for="t in topTags" :key="t.code" class="tally">{{ t.label }} <b>{{ t.count }}</b></span>
          <span class="total">후기 {{ summary.total }}</span>
        </template>
        <span v-else class="empty">아직 후기가 없어요 — 첫 후기를 남겨보세요</span>
        <button type="button" class="prv-open" @click="openForm">{{ hasMine ? '내 후기 수정' : '후기 남기기' }}</button>
      </div>
      <ul v-if="summary && summary.recent.length" class="prv-recent">
        <li v-for="r in summary.recent" :key="r.id">
          <span class="q">"{{ r.comment }}"</span>
          <span class="who">— {{ r.userName }} · {{ r.department }}</span>
        </li>
      </ul>
    </div>

    <div v-else class="prv-form">
      <div class="prv-tags" role="group" aria-label="이 장소는 어땠나요">
        <button
          v-for="t in PLACE_TAGS"
          :key="t.code"
          type="button"
          class="chip"
          :class="{ on: selected.includes(t.code) }"
          :aria-pressed="selected.includes(t.code)"
          @click="toggle(t.code)"
        >{{ PLACE_TAG_LABEL[t.code] }}</button>
      </div>
      <div class="prv-comment">
        <input
          v-model="comment"
          class="input"
          :maxlength="COMMENT_MAX"
          placeholder="한 줄 후기 (선택)"
          @keyup.enter="save"
        >
        <span class="count">{{ comment.length }}/{{ COMMENT_MAX }}</span>
      </div>
      <div class="prv-acts">
        <button v-if="hasMine" type="button" class="danger" :disabled="saving" @click="remove">삭제</button>
        <button type="button" class="btn sm" :disabled="saving" @click="open = false">취소</button>
        <button type="button" class="btn sm primary" :disabled="saving || selected.length === 0" @click="save">
          {{ saving ? '저장 중...' : '저장' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prv { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
.prv-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
.tally { color: var(--ink); background: var(--hover); border-radius: 999px; padding: 3px 9px; }
.tally b { color: var(--red); font-weight: 700; margin-left: 2px; }
.total { color: var(--sub); }
.empty { color: var(--sub); }
.prv-open { margin-left: auto; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--red); background: none; border: 0; padding: 0; cursor: pointer; }
.prv-open:hover { text-decoration: underline; }
.prv-recent { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.prv-recent .q { color: var(--ink); }
.prv-recent .who { color: var(--sub); margin-left: 6px; }

.prv-form { display: flex; flex-direction: column; gap: 10px; }
.prv-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.prv-tags .chip { font-size: 12.5px; padding: 5px 11px; font-family: inherit; }
.prv-comment { display: flex; align-items: center; gap: 8px; }
.prv-comment .input { flex: 1; font-size: 13px; }
.prv-comment .count { font-size: 11.5px; color: var(--sub); flex-shrink: 0; }
.prv-acts { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
.prv-acts .danger { margin-right: auto; font: inherit; font-size: 12.5px; color: var(--sub); background: none; border: 0; padding: 0; cursor: pointer; }
.prv-acts .danger:hover { color: var(--red); }
</style>
```

- [ ] **Step 2: places.vue — 요약 조회 상태와 함수 추가**

`app/pages/places.vue` `<script setup>`에서 `import type { Place } from '#shared/types'`를 `import type { Place, PlaceReviewSummary } from '#shared/types'`로 바꾸고, `const isFallback = ...` 위에 추가:

```ts
/** 장소 id → 후기 요약. 목록이 바뀔 때마다 한 번에 다시 받는다. */
const reviewSummaries = ref<Map<string, PlaceReviewSummary>>(new Map())

async function fetchReviewSummaries(places: Place[]) {
  const ids = places.map((p) => p.kakaoId).filter((id): id is string => Boolean(id))
  if (ids.length === 0 || !user.value) {
    reviewSummaries.value = new Map()
    return
  }
  try {
    const list = await api<PlaceReviewSummary[]>('/api/place-reviews', { query: { ids: ids.join(',') } })
    reviewSummaries.value = new Map(list.map((s) => [s.kakaoPlaceId, s]))
  } catch {
    // 후기 요약은 부가 정보 — 실패해도 장소 목록은 그대로 보여준다.
    reviewSummaries.value = new Map()
  }
}

function onReviewChanged(summary: PlaceReviewSummary) {
  const next = new Map(reviewSummaries.value)
  next.set(summary.kakaoPlaceId, summary)
  reviewSummaries.value = next
}
```

`fetchPlaces()`의 `fetchedPlaces.value = await api<Place[]>('/api/places', { query })` 바로 다음 줄에 `void fetchReviewSummaries(fetchedPlaces.value)` 추가.

`kakaoMapUrl` 함수를 다음으로 교체(placeUrl 우선):

```ts
/** "카카오맵에서 보기"는 장소 상세 페이지(placeUrl, 카카오 리뷰가 있는 곳)를 우선하고, 없으면 좌표 링크. */
function kakaoMapUrl(place: Place, kind: 'map' | 'to'): string {
  if (kind === 'map' && place.placeUrl) return place.placeUrl
  return `https://map.kakao.com/link/${kind}/${encodeURIComponent(place.name)},${place.lat},${place.lng}`
}
```

- [ ] **Step 3: places.vue — 템플릿 연결**

`<div v-for="(place, i) in displayList" :key="place.name" class="place">` → `:key="place.kakaoId ?? place.name"`.

`.acts` div 바로 아래(같은 `.place` 안)에:

```vue
            <ReadingPlaceReviewPanel
              :place="place"
              :summary="place.kakaoId ? (reviewSummaries.get(place.kakaoId) ?? null) : null"
              @changed="onReviewChanged"
            />
```

- [ ] **Step 4: 빌드 + 브라우저 확인**

Run: `npm run build` → Expected: 성공.
Run: `npm run dev` 후 `/places` 로그인 상태로:
1. 각 카드 하단에 "아직 후기가 없어요 — 첫 후기를 남겨보세요" + "후기 남기기".
2. 후기 남기기 → 칩 6개, 선택 시 레드 테두리·틴트, 태그 0개면 저장 비활성.
3. 태그 2개 + 한 줄 저장 → 접히며 `조용해요 1 · 콘센트 있어요 1 · 후기 1` + 코멘트 1줄 + "내 후기 수정".
4. 내 후기 수정 → 이전 선택이 채워져 열림 → 삭제 → confirm → 빈 상태로 복귀.
5. 검색어 바꿔 목록 갱신 시 요약도 갱신.
6. 폭 400px에서 칩 줄바꿈·버튼 정렬 확인.
7. 키 없는 폴백 상태(예시 4곳)에서는 후기 UI가 아예 안 보임.

- [ ] **Step 5: 커밋**

```bash
git add app/components/reading/PlaceReviewPanel.vue app/pages/places.vue
git commit -m "feat: 장소 카드 안 태그 후기 패널 — 집계 칩·최근 코멘트·인라인 작성/수정/삭제

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 전체 검증 + 문서

**Files:**
- Modify: `docs/plans/로드맵.md` (완료 항목 추가)
- Create: `docs/devlog/2026-09-16-장소-후기.md`
- Modify: `docs/references/외부-API.md` (카카오 로컬 응답 필드·리뷰 없음 메모)

- [ ] **Step 1: 전체 테스트·빌드**

Run: `npx vitest run` → Expected: 기존 전부 + 신규(kakaoLocalPlace 2, placeReviewInput 6, placeReviewRepo 5) PASS.
Run: `npm run build` → Expected: 성공.

- [ ] **Step 2: 로드맵 갱신**

`docs/plans/로드맵.md`의 `- [x] 웹 접근성 모드 4종...` 줄 아래에:

```md
- [x] 장소 후기(태그 칩 + 한 줄, 카드 안 인라인) — [[../decisions/2026-09-16-장소-후기-자체구현|결정]] (2026-09-16)
```

- [ ] **Step 3: 외부 API 참고 메모**

`docs/references/외부-API.md` 끝에:

```md
## 카카오 로컬 검색 — 리뷰 없음 (2026-09-16 확인)

- `GET https://dapi.kakao.com/v2/local/search/keyword.json` 응답 documents 필드: `id, place_name, category_name, category_group_code, category_group_name, phone, address_name, road_address_name, x, y, place_url, distance`. **평점·리뷰 없음.** 지도 JS SDK에도 리뷰 API 없음.
- `place_url`(`http://place.map.kakao.com/{id}`)이 카카오 리뷰가 있는 상세 페이지 — 아웃링크로만 쓴다. iframe은 현재 프레임 차단 헤더가 없어 뜰 수는 있으나 비공식이라 쓰지 않음.
- `id`는 장소 후기(`place_reviews.kakao_place_id`)의 안정 키로 사용.
```

- [ ] **Step 4: 개발일지**

`docs/devlog/2026-09-16-장소-후기.md`:

```md
# 2026-09-16 장소 후기(태그 칩)

## 한 일

- "카카오 리뷰 임베딩" 요청 → 조사(리뷰 API 없음, iframe 비공식) → 자체 태그 후기로 결정 — [[../decisions/2026-09-16-장소-후기-자체구현]]
- `Place.kakaoId/placeUrl` 매핑, `place_reviews` 테이블(1인 1후기 upsert), 입력 검증, 레포, API 3종
- `ReadingPlaceReviewPanel`: 카드 안 집계 칩(많은 순 3개) + 최근 코멘트 2줄 + 인라인 작성/수정/삭제
- "카카오맵에서 보기"는 이제 장소 상세(`place_url`)로 — 카카오 리뷰는 거기서

## 검증

- vitest 신규 13건(kakaoLocalPlace 2 · placeReviewInput 6 · placeReviewRepo 5), 전체 green, `npm run build` 통과
- 브라우저: 작성→집계→수정→삭제 흐름, 검색 변경 시 요약 갱신, 400px 레이아웃, 폴백 예시에서 후기 UI 숨김

## 다음

- 운영 반영 후 시연 계정으로 후기 몇 건 미리 쌓기(빈 카드보다 집계가 보이는 편이 시연에 좋다)
- 필요해지면: 관리자 삭제, 내 서재 "내가 남긴 장소 후기"
```

- [ ] **Step 5: 커밋**

```bash
git add docs/plans/로드맵.md docs/references/외부-API.md docs/devlog/2026-09-16-장소-후기.md
git commit -m "docs: 장소 후기 개발일지·로드맵·카카오 로컬 응답 메모

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
