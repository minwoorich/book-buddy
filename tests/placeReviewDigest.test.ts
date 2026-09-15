import { describe, it, expect } from 'vitest'
import { toAgentPlaces, toAgentReviewedPlaces } from '../server/ai/tools/placeReviewDigest'
import type { Place, PlaceReviewSummary, ReviewedPlace } from '../shared/types'

const cafe: Place = {
  name: '청수당 베이커리',
  category: '디저트카페',
  address: '서울 종로구 돈화문로11나길 31-9',
  mapx: 1269897847,
  mapy: 375738813,
  lng: 126.98978,
  lat: 37.57388,
  distanceM: 320,
  kakaoId: '78911659',
}
const park: Place = { ...cafe, name: '반석산 공원', category: '공원', kakaoId: '10002', distanceM: 900 }
const noId: Place = { ...cafe, name: '이름만 있는 곳', kakaoId: undefined }

function summary(over: Partial<PlaceReviewSummary>): PlaceReviewSummary {
  return { kakaoPlaceId: '78911659', total: 0, tagCounts: {}, recent: [], mine: null, ...over }
}

describe('toAgentPlaces', () => {
  it('kakaoId로 후기 요약을 붙이고, 태그는 라벨 → 개수로 많은 순 정렬한다', () => {
    const [place] = toAgentPlaces(
      [cafe],
      [
        summary({
          total: 3,
          tagCounts: { outlet: 1, quiet: 3, bright: 2 },
          recent: [
            { id: 2, userName: '김민우', department: '개발팀', comment: '창가 자리 좋아요', createdAt: '' },
            { id: 1, userName: '박지영', department: '디자인팀', comment: '오후엔 붐벼요', createdAt: '' },
          ],
        }),
      ]
    )

    expect(place).toMatchObject({
      name: '청수당 베이커리',
      category: '디저트카페',
      address: '서울 종로구 돈화문로11나길 31-9',
      distanceM: 320,
    })
    expect(place.mapUrl).toContain('map.kakao.com')
    expect(place.reviews).toEqual({
      total: 3,
      tags: { 조용해요: 3, '채광 좋아요': 2, '콘센트 있어요': 1 },
      comments: ['김민우(개발팀): 창가 자리 좋아요', '박지영(디자인팀): 오후엔 붐벼요'],
    })
    expect(Object.keys(place.reviews!.tags)).toEqual(['조용해요', '채광 좋아요', '콘센트 있어요'])
  })

  it('후기가 0건이면 reviews 키를 아예 만들지 않는다', () => {
    const [place] = toAgentPlaces([cafe], [summary({ total: 0 })])
    expect(place).not.toHaveProperty('reviews')
  })

  it('kakaoId가 없는 장소는 후기 없이 그대로 통과시킨다', () => {
    const [place] = toAgentPlaces([noId], [summary({ total: 5, tagCounts: { quiet: 5 } })])
    expect(place.name).toBe('이름만 있는 곳')
    expect(place).not.toHaveProperty('reviews')
  })

  it('요약이 장소 순서와 달라도 kakaoId로 맞춰 붙인다', () => {
    const places = toAgentPlaces(
      [cafe, park],
      [summary({ kakaoPlaceId: '10002', total: 1, tagCounts: { bright: 1 } }), summary({ total: 2, tagCounts: { quiet: 2 } })]
    )
    expect(places[0].reviews?.tags).toEqual({ 조용해요: 2 })
    expect(places[1].reviews?.tags).toEqual({ '채광 좋아요': 1 })
  })

  it('거리가 없으면 distanceM은 null', () => {
    const [place] = toAgentPlaces([{ ...cafe, distanceM: undefined }], [])
    expect(place.distanceM).toBeNull()
  })
})

describe('toAgentReviewedPlaces', () => {
  it('후기 집계를 이름·태그·코멘트·카카오맵 링크로 바꾼다', () => {
    const reviewed: ReviewedPlace = {
      kakaoPlaceId: '78911659',
      placeName: '청수당 베이커리',
      total: 4,
      tagCounts: { quiet: 4, noisy: 1 },
      recentComments: ['창가 자리 좋아요'],
    }
    expect(toAgentReviewedPlaces([reviewed])).toEqual([
      {
        name: '청수당 베이커리',
        total: 4,
        tags: { 조용해요: 4, 시끄러워요: 1 },
        comments: ['창가 자리 좋아요'],
        mapUrl: 'https://place.map.kakao.com/78911659',
      },
    ])
  })
})
