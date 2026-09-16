import { describe, it, expect } from 'vitest'
import { collectPlaceEvidence } from '../server/ai/placeEvidence'

/** ToolMessage 흉내 — 실제 res.messages 원소처럼 name/content만 본다. */
function toolMsg(name: string, payload: unknown) {
  return { name, content: JSON.stringify(payload) }
}

const readingPlaces = toolMsg('search_reading_places', {
  office: '바텍네트웍스 본사',
  places: [
    {
      name: '커피베이 동탄점',
      category: '카페',
      address: '경기 화성시 동탄대로 1',
      distanceM: 320,
      mapUrl: 'https://map.kakao.com/link/map/커피베이 동탄점,37.2,127.1',
      reviews: {
        total: 4,
        tags: { 조용해요: 3, '콘센트 있어요': 2 },
        comments: ['김민우(개발팀): 창가 자리가 넓어요', '박지영(디자인팀): 오후엔 붐벼요'],
      },
    },
    {
      name: '스타벅스 동탄영천점',
      category: '카페',
      address: '경기 화성시 동탄대로 2',
      distanceM: 500,
      mapUrl: 'https://map.kakao.com/link/map/스타벅스 동탄영천점,37.3,127.2',
    },
  ],
})

describe('collectPlaceEvidence', () => {
  it('답변에 이름이 나온, 후기가 있는 장소만 근거로 모은다', () => {
    const evidence = collectPlaceEvidence([readingPlaces], '커피베이 동탄점을 추천해요. 동료 3명이 조용하다고 했어요.')

    expect(evidence).toEqual([
      {
        name: '커피베이 동탄점',
        total: 4,
        tags: { 조용해요: 3, '콘센트 있어요': 2 },
        comments: ['김민우(개발팀): 창가 자리가 넓어요', '박지영(디자인팀): 오후엔 붐벼요'],
        mapUrl: 'https://map.kakao.com/link/map/커피베이 동탄점,37.2,127.1',
      },
    ])
  })

  it('후기가 없는 장소는 이름이 언급돼도 근거가 되지 않는다', () => {
    const evidence = collectPlaceEvidence([readingPlaces], '스타벅스 동탄영천점이 가까워요.')
    expect(evidence).toEqual([])
  })

  it('띄어쓰기가 달라도 언급으로 본다', () => {
    const evidence = collectPlaceEvidence([readingPlaces], '커피베이동탄점 어떠세요?')
    expect(evidence.map((e) => e.name)).toEqual(['커피베이 동탄점'])
  })

  it('search_reviewed_places 결과도 같은 모양의 근거로 모은다', () => {
    const reviewed = toolMsg('search_reviewed_places', {
      places: [
        {
          name: '북앤커피',
          total: 7,
          tags: { 조용해요: 5 },
          comments: ['이한솔(영업팀): 2층이 조용해요'],
          mapUrl: 'https://place.map.kakao.com/12345',
        },
      ],
    })

    expect(collectPlaceEvidence([reviewed], '북앤커피가 제일 많이 꼽혔어요.')).toEqual([
      {
        name: '북앤커피',
        total: 7,
        tags: { 조용해요: 5 },
        comments: ['이한솔(영업팀): 2층이 조용해요'],
        mapUrl: 'https://place.map.kakao.com/12345',
      },
    ])
  })

  it('이름이 하나도 안 걸리면 후기 많은 순 상위 3곳으로 폴백한다', () => {
    const many = toolMsg('search_reviewed_places', {
      places: [
        { name: 'A', total: 1, tags: {}, comments: [], mapUrl: 'a' },
        { name: 'B', total: 9, tags: {}, comments: [], mapUrl: 'b' },
        { name: 'C', total: 5, tags: {}, comments: [], mapUrl: 'c' },
        { name: 'D', total: 7, tags: {}, comments: [], mapUrl: 'd' },
      ],
    })

    expect(collectPlaceEvidence([many], '조용한 곳들을 모아봤어요.').map((e) => e.name)).toEqual(['B', 'D', 'C'])
  })

  it('같은 장소가 두 도구에서 겹쳐 나와도 한 번만 담는다', () => {
    const reviewed = toolMsg('search_reviewed_places', {
      places: [{ name: '커피베이 동탄점', total: 4, tags: { 조용해요: 3 }, comments: [], mapUrl: 'x' }],
    })

    const evidence = collectPlaceEvidence([readingPlaces, reviewed], '커피베이 동탄점을 추천해요.')
    expect(evidence).toHaveLength(1)
    expect(evidence[0].mapUrl).toBe('https://map.kakao.com/link/map/커피베이 동탄점,37.2,127.1')
  })

  it('장소 도구를 쓰지 않은 대화에서는 빈 배열이다', () => {
    const books = toolMsg('search_books', { books: [{ id: 1, title: '클린 코드' }] })
    expect(collectPlaceEvidence([books], '클린 코드를 추천해요.')).toEqual([])
  })

  it('도구가 message만 돌려주거나 깨진 JSON이어도 터지지 않는다', () => {
    const noPlaces = toolMsg('search_reviewed_places', { message: '아직 사내 후기가 쌓인 장소가 없어요' })
    const broken = { name: 'search_reading_places', content: '{"places":[' }
    expect(collectPlaceEvidence([noPlaces, broken], '아직 후기가 없어요.')).toEqual([])
  })
})
