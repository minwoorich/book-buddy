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

    expect(park).toEqual({ kakaoPlaceId: PARK, total: 0, tagCounts: {}, recent: [], photos: [], photoCount: 0, mine: null })
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

  it('removeMine은 내 것만 지우고, 없으면 null', () => {
    const me = insertUser('김민우')
    const other = insertUser('박지영')
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '' })
    placeReviewRepo.upsert(CAFE, other, { placeName: '카페', tags: ['quiet'], comment: '' })

    expect(placeReviewRepo.removeMine(CAFE, me)).toEqual([])
    expect(placeReviewRepo.removeMine(CAFE, me)).toBeNull()
    expect(placeReviewRepo.findMine(CAFE, me)).toBeUndefined()
    expect(placeReviewRepo.findMine(CAFE, other)).toBeDefined()
  })

  it('ids가 비면 빈 배열', () => {
    expect(placeReviewRepo.summaryByIds([], 1)).toEqual([])
  })

  it('upsert는 사진 경로를 저장하고, 수정 때 넘긴 목록으로 통째로 갈아끼운다', () => {
    const me = insertUser('김민우')
    placeReviewRepo.upsert(CAFE, me, {
      placeName: '카페',
      tags: ['quiet'],
      comment: '',
      images: ['/api/uploads/a.jpg', '/api/uploads/b.jpg'],
    })
    expect(placeReviewRepo.findMine(CAFE, me)?.images).toEqual(['/api/uploads/a.jpg', '/api/uploads/b.jpg'])

    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '', images: ['/api/uploads/b.jpg'] })
    expect(placeReviewRepo.findMine(CAFE, me)?.images).toEqual(['/api/uploads/b.jpg'])
  })

  it('images를 안 넘긴 후기는 빈 배열로 읽힌다(사진 기능 이전 데이터)', () => {
    const me = insertUser('김민우')
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '' })
    expect(placeReviewRepo.findMine(CAFE, me)?.images).toEqual([])
  })

  it('summaryByIds는 최근 사진 3장까지와 전체 장수를 함께 준다', () => {
    const me = insertUser('김민우')
    const a = insertUser('박지영')
    const b = insertUser('이서준')
    placeReviewRepo.upsert(CAFE, a, { placeName: '카페', tags: ['quiet'], comment: '', images: ['/api/uploads/a1.jpg', '/api/uploads/a2.jpg'] })
    placeReviewRepo.upsert(CAFE, b, { placeName: '카페', tags: ['quiet'], comment: '', images: ['/api/uploads/b1.jpg'] })
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '', images: ['/api/uploads/m1.jpg'] })
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 10:00:00' WHERE user_id = ?`).run(a)
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 11:00:00' WHERE user_id = ?`).run(b)
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 12:00:00' WHERE user_id = ?`).run(me)

    const [cafe] = placeReviewRepo.summaryByIds([CAFE], me)
    expect(cafe.photoCount).toBe(4)
    expect(cafe.photos).toEqual(['/api/uploads/m1.jpg', '/api/uploads/b1.jpg', '/api/uploads/a1.jpg'])
    expect(cafe.mine).toMatchObject({ images: ['/api/uploads/m1.jpg'] })
  })

  it('사진이 없으면 photos는 빈 배열, photoCount는 0', () => {
    const me = insertUser('김민우')
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '' })
    const [cafe] = placeReviewRepo.summaryByIds([CAFE], me)
    expect(cafe.photos).toEqual([])
    expect(cafe.photoCount).toBe(0)
  })

  it('detailByPlace는 후기 전체를 최신순으로, 내 후기는 맨 앞에 둔다', () => {
    const me = insertUser('김민우')
    const a = insertUser('박지영', '디자인팀')
    const b = insertUser('이서준', '영업팀')
    placeReviewRepo.upsert(CAFE, a, { placeName: '카페', tags: ['quiet', 'outlet'], comment: '조용해요' })
    placeReviewRepo.upsert(CAFE, b, { placeName: '카페', tags: ['bright'], comment: '', images: ['/api/uploads/b1.jpg'] })
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '내 후기' })
    // 내 후기를 가장 오래된 것으로 만들어도 맨 앞에 와야 한다.
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 09:00:00' WHERE user_id = ?`).run(me)
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 10:00:00' WHERE user_id = ?`).run(a)
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 11:00:00' WHERE user_id = ?`).run(b)

    const detail = placeReviewRepo.detailByPlace(CAFE, me)

    expect(detail.total).toBe(3)
    expect(detail.tagCounts).toEqual({ quiet: 2, outlet: 1, bright: 1 })
    expect(detail.reviews.map((r) => r.userName)).toEqual(['김민우', '이서준', '박지영'])
    expect(detail.mineId).toBe(detail.reviews[0].id)
    expect(detail.reviews[1]).toMatchObject({ department: '영업팀', images: ['/api/uploads/b1.jpg'] })
  })

  it('detailByPlace — 후기가 없으면 빈 목록과 mineId null', () => {
    expect(placeReviewRepo.detailByPlace(PARK, 1)).toEqual({
      kakaoPlaceId: PARK,
      total: 0,
      tagCounts: {},
      reviews: [],
      mineId: null,
    })
  })

  it('remove는 지운 후기의 사진 경로를 돌려준다(파일 정리용)', () => {
    const me = insertUser('김민우')
    placeReviewRepo.upsert(CAFE, me, { placeName: '카페', tags: ['quiet'], comment: '', images: ['/api/uploads/a.jpg'] })
    expect(placeReviewRepo.removeMine(CAFE, me)).toEqual(['/api/uploads/a.jpg'])
    expect(placeReviewRepo.removeMine(CAFE, me)).toBeNull()
  })
})
