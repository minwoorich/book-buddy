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
const LIB = '10001'
const PARK = '10002'

beforeEach(() => {
  initDb(':memory:')
})

describe('placeReviewRepo.topPlaces', () => {
  it('후기가 하나도 없으면 빈 배열', () => {
    expect(placeReviewRepo.topPlaces({})).toEqual([])
  })

  it('장소별로 묶어 태그를 집계하고, 후기 많은 순으로 돌려준다', () => {
    const a = insertUser('박지영', '디자인팀')
    const b = insertUser('이서준', '영업팀')
    placeReviewRepo.upsert(CAFE, a, { placeName: '청수당 베이커리', tags: ['quiet', 'outlet'], comment: '창가 좋아요' })
    placeReviewRepo.upsert(CAFE, b, { placeName: '청수당 베이커리', tags: ['quiet'], comment: '' })
    placeReviewRepo.upsert(LIB, a, { placeName: '동탄도서관', tags: ['quiet'], comment: '' })

    const places = placeReviewRepo.topPlaces({})

    expect(places.map((p) => p.kakaoPlaceId)).toEqual([CAFE, LIB])
    expect(places[0]).toMatchObject({
      kakaoPlaceId: CAFE,
      placeName: '청수당 베이커리',
      total: 2,
      tagCounts: { quiet: 2, outlet: 1 },
      recentComments: ['창가 좋아요'],
    })
    expect(places[1]).toMatchObject({ placeName: '동탄도서관', total: 1, recentComments: [] })
  })

  it('tag를 주면 그 태그가 달린 장소만, 그 태그 수가 많은 순으로 돌려준다', () => {
    const a = insertUser('박지영')
    const b = insertUser('이서준')
    const c = insertUser('최유나')
    // 카페: 후기 3건이지만 quiet은 1건
    placeReviewRepo.upsert(CAFE, a, { placeName: '카페', tags: ['quiet'], comment: '' })
    placeReviewRepo.upsert(CAFE, b, { placeName: '카페', tags: ['noisy'], comment: '' })
    placeReviewRepo.upsert(CAFE, c, { placeName: '카페', tags: ['bright'], comment: '' })
    // 도서관: 후기 2건 모두 quiet
    placeReviewRepo.upsert(LIB, a, { placeName: '도서관', tags: ['quiet'], comment: '' })
    placeReviewRepo.upsert(LIB, b, { placeName: '도서관', tags: ['quiet'], comment: '' })
    // 공원: quiet 없음 → 제외
    placeReviewRepo.upsert(PARK, a, { placeName: '공원', tags: ['bright'], comment: '' })

    const places = placeReviewRepo.topPlaces({ tag: 'quiet' })

    expect(places.map((p) => p.placeName)).toEqual(['도서관', '카페'])
  })

  it('limit으로 개수를 자른다', () => {
    const a = insertUser('박지영')
    placeReviewRepo.upsert(CAFE, a, { placeName: '카페', tags: ['quiet'], comment: '' })
    placeReviewRepo.upsert(LIB, a, { placeName: '도서관', tags: ['quiet'], comment: '' })

    expect(placeReviewRepo.topPlaces({ limit: 1 })).toHaveLength(1)
  })

  it('placeName과 recentComments는 최근 후기 순서를 따른다(최대 2건)', () => {
    const a = insertUser('박지영')
    const b = insertUser('이서준')
    const c = insertUser('최유나')
    placeReviewRepo.upsert(CAFE, a, { placeName: '옛 이름', tags: ['quiet'], comment: '가장 오래된' })
    placeReviewRepo.upsert(CAFE, b, { placeName: '옛 이름', tags: ['quiet'], comment: '중간' })
    placeReviewRepo.upsert(CAFE, c, { placeName: '새 이름', tags: ['quiet'], comment: '가장 최근' })
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-14 10:00:00' WHERE user_id = ?`).run(a)
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-15 10:00:00' WHERE user_id = ?`).run(b)
    getDb().prepare(`UPDATE place_reviews SET updated_at = '2026-09-16 10:00:00' WHERE user_id = ?`).run(c)

    const [cafe] = placeReviewRepo.topPlaces({})

    expect(cafe.placeName).toBe('새 이름')
    expect(cafe.recentComments).toEqual(['가장 최근', '중간'])
  })
})
