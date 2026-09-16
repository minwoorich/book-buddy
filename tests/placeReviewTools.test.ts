import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { placeReviewRepo } from '../server/repositories/placeReviewRepo'
import { makeSearchReadingPlaces } from '../server/ai/tools/searchReadingPlaces'
import { makeSearchReviewedPlaces } from '../server/ai/tools/searchReviewedPlaces'
import { createPlaceCollector } from '../server/ai/placeCollector'

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

const KAKAO_RESPONSE = {
  documents: [
    {
      id: CAFE,
      place_name: '청수당 베이커리',
      category_name: '음식점 > 카페 > 디저트카페',
      road_address_name: '경기 화성시 동탄대로 1',
      x: '126.98978471926921',
      y: '37.57388138546145',
      place_url: 'http://place.map.kakao.com/78911659',
      distance: '320',
    },
    {
      id: '99999',
      place_name: '후기 없는 카페',
      category_name: '음식점 > 카페',
      road_address_name: '경기 화성시 동탄대로 2',
      x: '126.9',
      y: '37.5',
      place_url: 'http://place.map.kakao.com/99999',
      distance: '500',
    },
  ],
}

beforeEach(() => initDb(':memory:'))
afterEach(() => vi.unstubAllGlobals())

describe('search_reading_places — 후기 근거 붙이기', () => {
  it('후기가 있는 장소에만 동료 태그·코멘트를 붙여 돌려준다', async () => {
    const me = insertUser('김민우')
    const other = insertUser('박지영', '디자인팀')
    placeReviewRepo.upsert(CAFE, me, { placeName: '청수당 베이커리', tags: ['quiet'], comment: '창가 자리 좋아요' })
    placeReviewRepo.upsert(CAFE, other, { placeName: '청수당 베이커리', tags: ['quiet', 'outlet'], comment: '' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(KAKAO_RESPONSE), { status: 200 })))

    const raw = await makeSearchReadingPlaces('key', me).invoke({ kind: '카페', office: 'networks' })
    const result = JSON.parse(raw as string)

    expect(result.office).toBe('바텍네트웍스 본사')
    expect(result.places[0]).toMatchObject({ name: '청수당 베이커리', distanceM: 320 })
    expect(result.places[0].reviews).toEqual({
      total: 2,
      tags: { 조용해요: 2, '콘센트 있어요': 1 },
      comments: ['김민우(개발팀): 창가 자리 좋아요'],
    })
    expect(result.places[1]).not.toHaveProperty('reviews')
  })

  it('카카오 키가 없으면 안내만 돌려주고 호출하지 않는다', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const raw = await makeSearchReadingPlaces('', 1).invoke({ kind: '카페', office: 'networks' })
    expect(JSON.parse(raw as string).message).toContain('사용할 수 없어요')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('search_reviewed_places — 후기만으로 고르기', () => {
  it('태그로 거른 장소를 후기 수·코멘트·지도 링크와 함께 돌려준다', async () => {
    const a = insertUser('김민우')
    const b = insertUser('박지영', '디자인팀')
    placeReviewRepo.upsert(CAFE, a, { placeName: '청수당 베이커리', tags: ['quiet'], comment: '창가 자리 좋아요' })
    placeReviewRepo.upsert(CAFE, b, { placeName: '청수당 베이커리', tags: ['quiet'], comment: '' })
    placeReviewRepo.upsert('10002', a, { placeName: '반석산 공원', tags: ['bright'], comment: '' })

    const raw = await makeSearchReviewedPlaces().invoke({ tag: 'quiet' })
    const result = JSON.parse(raw as string)

    expect(result.places).toEqual([
      {
        name: '청수당 베이커리',
        total: 2,
        tags: { 조용해요: 2 },
        comments: ['창가 자리 좋아요'],
        mapUrl: 'https://place.map.kakao.com/78911659',
      },
    ])
  })

  it('후기가 아직 없으면 빈 목록 대신 다른 도구를 쓰라는 안내를 준다', async () => {
    const raw = await makeSearchReviewedPlaces().invoke({})
    const result = JSON.parse(raw as string)
    expect(result.places).toBeUndefined()
    expect(result.message).toContain('search_reading_places')
  })
})

describe('search_reading_places — 지도 마킹용 사이드 채널', () => {
  it('모델에 보낸 JSON과 별개로, 좌표가 살아 있는 원본 장소와 사업장 키를 collector에 기록한다', async () => {
    const me = insertUser('김민우')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(KAKAO_RESPONSE), { status: 200 })))
    const collector = createPlaceCollector()

    const raw = await makeSearchReadingPlaces('key', me, collector).invoke({ kind: '카페', office: 'msys' })

    // 모델이 읽는 쪽에는 좌표가 없다 — 쓰지도 않는 값으로 토큰을 쓰지 않기 위해서다.
    expect(JSON.parse(raw as string).places[0].lat).toBeUndefined()
    expect(collector.records()).toHaveLength(1)
    expect(collector.records()[0].officeKey).toBe('msys')
    expect(collector.records()[0].places[0]).toMatchObject({
      name: '청수당 베이커리',
      kakaoId: CAFE,
      lat: 37.57388138546145,
      lng: 126.98978471926921,
    })
  })

  it('검색이 실패하면 아무것도 기록하지 않는다', async () => {
    const me = insertUser('김민우')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const collector = createPlaceCollector()

    await makeSearchReadingPlaces('key', me, collector).invoke({ kind: '카페', office: 'msys' })

    expect(collector.records()).toEqual([])
  })

  it('카카오 키가 없으면 기록하지 않는다', async () => {
    const collector = createPlaceCollector()
    await makeSearchReadingPlaces('', insertUser('김민우'), collector).invoke({ kind: '카페', office: 'msys' })
    expect(collector.records()).toEqual([])
  })
})
