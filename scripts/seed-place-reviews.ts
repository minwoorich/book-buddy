/**
 * 장소 후기 시드 — 게스트(심사위원)를 제외한 실사용자들이 바텍 계열사 3개 사업장
 * (바텍네트웍스 본사·바텍엠시스·바텍이엠엑스) 반경의 실제 카페에 남긴 것처럼 채운다.
 * kakao_place_id는 카카오 로컬 키워드 검색으로 실제 조회한 값 — /places 화면에서
 * 해당 사업장을 기준으로 열면 진짜로 이 카페들이 뜨고 후기가 보인다.
 *
 * 실행: npx tsx scripts/seed-place-reviews.ts
 * - 이름으로 사용자를 찾으므로 로컬 데모 시드(사용자 12명)에서는 대부분 건너뛴다 —
 *   이 시드는 실제 계열사 인원이 많은 운영 DB를 채우기 위한 것.
 * - UNIQUE(kakao_place_id, user_id) upsert라 여러 번 실행해도 안전(내용만 갱신).
 */
import { initDb } from '../server/db/connection'
import type { PlaceTagCode } from '../shared/constants/placeTags'

interface ReviewSeed {
  place: string
  name: string
  user: string
  tags: PlaceTagCode[]
  comment: string
}

const REVIEWS: ReviewSeed[] = [
  // ── 바텍네트웍스 본사(동탄삼성디오네) 반경 카페 ──
  { place: '338492384', name: '매머드익스프레스 동탄삼성디오네점', user: '김민우', tags: ['outlet', 'spacious'], comment: '노트북 펴놓고 오래 있기 좋아요. 콘센트도 자리마다 있어요.' },
  { place: '338492384', name: '매머드익스프레스 동탄삼성디오네점', user: '한상우', tags: ['bright'], comment: '' },
  { place: '338492384', name: '매머드익스프레스 동탄삼성디오네점', user: '윤정경', tags: ['noisy', 'spacious'], comment: '점심시간엔 좀 시끄럽지만 자리는 넉넉해요.' },
  { place: '338492384', name: '매머드익스프레스 동탄삼성디오네점', user: '최수민', tags: ['long-stay', 'outlet'], comment: '회의 끝나고 노트북 작업하기 딱 좋아요.' },

  { place: '970382557', name: '카페인사이드', user: '정다은', tags: ['quiet', 'bright'], comment: '창가 자리가 채광이 좋아서 책 읽기 좋아요.' },
  { place: '970382557', name: '카페인사이드', user: '윤소라', tags: ['quiet'], comment: '' },
  { place: '970382557', name: '카페인사이드', user: '김효민', tags: ['spacious', 'long-stay'], comment: '테이블이 넓어서 서류 펼쳐놓고 일하기 편해요.' },
  { place: '970382557', name: '카페인사이드', user: '유자선', tags: ['outlet'], comment: '' },
  { place: '970382557', name: '카페인사이드', user: '전호연', tags: ['quiet', 'long-stay'], comment: '평일 오후엔 한적해서 집중이 잘 돼요.' },

  { place: '1037332087', name: '우지커피 동탄삼성디오네점', user: '최은지', tags: ['bright', 'spacious'], comment: '통유리라 낮에 밝고 좋아요.' },
  { place: '1037332087', name: '우지커피 동탄삼성디오네점', user: '강태호', tags: ['noisy'], comment: '직장인들 많아서 점심시간엔 시끄러워요.' },
  { place: '1037332087', name: '우지커피 동탄삼성디오네점', user: '임준영', tags: ['outlet', 'long-stay'], comment: '' },

  { place: '866839918', name: '둘리네푸드까페', user: '전민민', tags: ['quiet', 'spacious'], comment: '브런치도 되고 자리도 넓어서 여유롭게 있기 좋아요.' },
  { place: '866839918', name: '둘리네푸드까페', user: '유지빈', tags: ['bright'], comment: '' },
  { place: '866839918', name: '둘리네푸드까페', user: '안율호', tags: ['long-stay'], comment: '회사에서 좀 걸어야 하지만 조용해서 자주 가요.' },

  { place: '242548897', name: '오브라더스', user: '허창훈', tags: ['quiet', 'bright'], comment: '작은 카페인데 조용하고 채광이 예뻐요.' },
  { place: '242548897', name: '오브라더스', user: '안성우', tags: ['outlet'], comment: '' },

  // ── 바텍엠시스(수원 고색산단) 반경 카페 ──
  { place: '37215014', name: '우지커피 수원고색산단점', user: '성시연', tags: ['spacious', 'outlet'], comment: '산단 근처라 그런지 자리도 넉넉하고 콘센트도 많아요.' },
  { place: '37215014', name: '우지커피 수원고색산단점', user: '류은율', tags: ['noisy'], comment: '출퇴근 시간엔 사람이 많아서 좀 시끄러워요.' },
  { place: '37215014', name: '우지커피 수원고색산단점', user: '유겸혁', tags: ['long-stay'], comment: '' },
  { place: '37215014', name: '우지커피 수원고색산단점', user: '노혜호', tags: ['bright', 'quiet'], comment: '오전엔 한적하고 채광도 좋아서 책 보기 좋아요.' },

  { place: '1794102024', name: '메가MGC커피 수원산업단지점', user: '이린우', tags: ['outlet', 'spacious'], comment: '가성비 좋고 자리도 넓어서 노트북 하기 편해요.' },
  { place: '1794102024', name: '메가MGC커피 수원산업단지점', user: '서완호', tags: ['quiet'], comment: '' },
  { place: '1794102024', name: '메가MGC커피 수원산업단지점', user: '차나우', tags: ['long-stay', 'outlet'], comment: '오래 앉아있어도 눈치 안 보여서 좋아요.' },
  { place: '1794102024', name: '메가MGC커피 수원산업단지점', user: '윤유민', tags: ['noisy'], comment: '테이크아웃 손님이 많아서 좀 소란스러워요.' },

  { place: '507395504', name: '빽다방 수원고색산업단지점', user: '노수라', tags: ['outlet'], comment: '' },
  { place: '507395504', name: '빽다방 수원고색산업단지점', user: '황솔솔', tags: ['spacious', 'bright'], comment: '낮에 햇살이 잘 들어와서 앉아있기 좋아요.' },
  { place: '507395504', name: '빽다방 수원고색산업단지점', user: '손서호', tags: ['long-stay'], comment: '저렴해서 부담 없이 오래 있기 좋아요.' },

  { place: '503711277', name: '카페카리스', user: '이경라', tags: ['quiet', 'bright'], comment: '동네 카페 느낌이라 조용하고 아늑해요.' },
  { place: '503711277', name: '카페카리스', user: '홍경희', tags: ['spacious'], comment: '' },
  { place: '503711277', name: '카페카리스', user: '최완아', tags: ['long-stay', 'quiet'], comment: '책 한 권 들고 가서 오래 읽기 좋았어요.' },

  { place: '1660860768', name: '우주라이크커피 서수원점', user: '임우민', tags: ['outlet', 'spacious'], comment: '자리가 넓고 콘센트가 곳곳에 있어서 작업하기 좋아요.' },
  { place: '1660860768', name: '우주라이크커피 서수원점', user: '민하준', tags: ['noisy'], comment: '' },

  // ── 바텍이엠엑스(용인 이동읍) 반경 카페 ──
  { place: '896723826', name: '카페8794 용인점', user: '박지훈', tags: ['spacious', 'bright'], comment: '이동 쪽엔 카페가 많지 않은데 여기는 자리도 넓고 밝아요.' },
  { place: '896723826', name: '카페8794 용인점', user: '오유진', tags: ['quiet'], comment: '' },
  { place: '896723826', name: '카페8794 용인점', user: '서지민', tags: ['long-stay', 'outlet'], comment: '오래 앉아 작업하기 좋고 콘센트도 넉넉해요.' },

  { place: '2031180980', name: '하디장커피', user: '심하솔', tags: ['quiet', 'bright'], comment: '한적한 동네라 그런지 조용하고 채광도 좋아요.' },
  { place: '2031180980', name: '하디장커피', user: '윤영우', tags: ['spacious'], comment: '' },
  { place: '2031180980', name: '하디장커피', user: '성윤율', tags: ['noisy'], comment: '주말엔 나들이객이 많아서 시끄러운 편이에요.' },

  { place: '1702557466', name: '루치아', user: '임나혁', tags: ['long-stay', 'quiet'], comment: '인테리어가 예쁘고 오래 있어도 편안해요.' },
  { place: '1702557466', name: '루치아', user: '이정원', tags: ['outlet'], comment: '' },
  { place: '1702557466', name: '루치아', user: '이지겸', tags: ['bright', 'spacious'], comment: '창이 커서 낮엔 정말 밝아요.' },

  { place: '1261255879', name: '용카페', user: '차예진', tags: ['quiet'], comment: '작은 로컬 카페인데 조용해서 집중하기 좋아요.' },
  { place: '1261255879', name: '용카페', user: '민민원', tags: ['outlet', 'spacious'], comment: '' },

  { place: '192028130', name: '투커피로스터스', user: '유규준', tags: ['long-stay', 'bright'], comment: '로스터리 카페라 향도 좋고 오래 있기 좋아요.' },
  { place: '192028130', name: '투커피로스터스', user: '황원진', tags: ['quiet'], comment: '' },
]

// KST 오전~저녁 시간대(UTC 01~11시)에 걸치도록 2026-08-26 ~ 2026-09-16 사이로 순서대로 흩뿌린다.
// created_at은 DB의 datetime('now')와 같은 '`YYYY-MM-DD HH:MM:SS`'(UTC, T/Z 없음) 형식이어야
// 프런트의 parseDbDate가 시간을 하루 밀리지 않고 맞게 해석한다.
const START = Date.parse('2026-08-26T01:30:00Z')
const END = Date.parse('2026-09-16T04:00:00Z')
const STEP = REVIEWS.length > 1 ? (END - START) / (REVIEWS.length - 1) : 0
const JITTER_HOURS = [8, 3, 10, 5, 1, 7]

function formatUtc(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

const db = initDb()
const findUser = db.prepare('SELECT id FROM users WHERE name = ? AND is_guest = 0')
const upsert = db.prepare(
  `INSERT INTO place_reviews (kakao_place_id, place_name, user_id, tags, comment, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(kakao_place_id, user_id) DO UPDATE SET
     place_name = excluded.place_name, tags = excluded.tags, comment = excluded.comment,
     updated_at = excluded.updated_at`
)

let written = 0
let skipped = 0
REVIEWS.forEach((r, i) => {
  const row = findUser.get(r.user) as { id: number } | undefined
  if (!row) {
    skipped++
    return
  }
  const createdAtMs = Math.min(START + STEP * i + JITTER_HOURS[i % JITTER_HOURS.length]! * 3600_000, END)
  const createdAt = formatUtc(createdAtMs)
  upsert.run(r.place, r.name, row.id, JSON.stringify(r.tags), r.comment, createdAt, createdAt)
  written++
})

const total = (db.prepare('SELECT COUNT(*) AS c FROM place_reviews').get() as { c: number }).c
console.log(`장소 후기 시드: ${written}건 반영, ${skipped}건 건너뜀(해당 이름 사용자 없음) — 전체 place_reviews ${total}건`)
