import { describe, it, expect } from 'vitest'
import { createPlaceCollector, pickRecommendation, withPlaceAction } from '../server/ai/placeCollector'
import type { ChatAction, Place } from '../shared/types'

function place(over: Partial<Place> & { name: string }): Place {
  return {
    category: '카페',
    address: '경기 수원시 권선구 산업로 1',
    mapx: 1269813809,
    mapy: 372439619,
    lat: 37.2439,
    lng: 126.9813,
    distanceM: 300,
    kakaoId: '1000',
    ...over,
  }
}

const 카페인사이드 = place({ name: '카페인사이드', kakaoId: '970382557' })
const 우지커피 = place({ name: '우지커피 동탄삼성디오네점', kakaoId: '1037332087', distanceM: 520 })
const 오브라더스 = place({ name: '오브라더스', kakaoId: '242548897', distanceM: 900 })

describe('createPlaceCollector', () => {
  it('도구가 기록한 검색 결과를 호출 순서대로 들고 있는다', () => {
    const collector = createPlaceCollector()
    collector.record({ officeKey: 'msys', places: [카페인사이드] })
    collector.record({ officeKey: 'msys', places: [우지커피] })

    expect(collector.records()).toEqual([
      { officeKey: 'msys', places: [카페인사이드] },
      { officeKey: 'msys', places: [우지커피] },
    ])
  })

  it('도구를 한 번도 안 쓰면 비어 있다', () => {
    expect(createPlaceCollector().records()).toEqual([])
  })
})

describe('pickRecommendation', () => {
  const records = [{ officeKey: 'msys', places: [카페인사이드, 우지커피, 오브라더스] }]

  it('답변이 이름을 부른 장소만, 검색 순서대로 고른다', () => {
    const rec = pickRecommendation(records, '오브라더스와 카페인사이드를 추천해요.')

    expect(rec).not.toBeNull()
    expect(rec!.officeKey).toBe('msys')
    expect(rec!.places.map((p) => p.name)).toEqual(['카페인사이드', '오브라더스'])
  })

  it('띄어쓰기가 달라도 부른 것으로 본다', () => {
    const rec = pickRecommendation(records, '우지커피동탄삼성디오네점이 가까워요.')
    expect(rec!.places.map((p) => p.name)).toEqual(['우지커피 동탄삼성디오네점'])
  })

  it('이름을 하나도 안 불렀으면 사업장만 남기고 장소는 비운다', () => {
    // 엉뚱한 곳을 "추천한 곳"이라고 지도에 찍느니 기준점만 옮기는 편이 정직하다.
    const rec = pickRecommendation(records, '근처에 괜찮은 카페가 몇 곳 있어요.')
    expect(rec).toEqual({ officeKey: 'msys', places: [] })
  })

  it('검색을 여러 번 했으면 결과를 합치고 사업장은 마지막 것을 쓴다', () => {
    const rec = pickRecommendation(
      [
        { officeKey: 'networks', places: [카페인사이드] },
        { officeKey: 'msys', places: [우지커피] },
      ],
      '카페인사이드와 우지커피 동탄삼성디오네점이요.'
    )
    expect(rec!.officeKey).toBe('msys')
    expect(rec!.places.map((p) => p.name)).toEqual(['카페인사이드', '우지커피 동탄삼성디오네점'])
  })

  it('같은 장소가 두 번 검색돼도 한 번만 담는다', () => {
    const rec = pickRecommendation(
      [
        { officeKey: 'msys', places: [카페인사이드] },
        { officeKey: 'msys', places: [카페인사이드, 우지커피] },
      ],
      '카페인사이드 좋아요.'
    )
    expect(rec!.places).toEqual([카페인사이드])
  })

  it('장소 검색 도구를 안 썼으면 null이다', () => {
    // search_reviewed_places만 쓴 턴 — 좌표가 없어 지도에 찍을 것도, 옮길 기준점도 없다.
    expect(pickRecommendation([], '동료들이 북앤커피를 많이 꼽았어요.')).toBeNull()
  })
})

describe('withPlaceAction', () => {
  const rec = { officeKey: 'msys', places: [카페인사이드, 우지커피] }

  it('기존 /places 버튼에 사업장과 추천 장소를 실어 보낸다', () => {
    const actions: ChatAction[] = [{ type: 'navigate', label: '책 읽기 좋은 장소 보기', to: '/places' }]

    expect(withPlaceAction(actions, rec)).toEqual([
      { type: 'navigate', label: '추천한 2곳 지도에서 보기', to: '/places?office=msys&picks=1' },
    ])
  })

  it('/places 버튼이 없으면 만들어 준다', () => {
    expect(withPlaceAction([], rec)).toEqual([
      { type: 'navigate', label: '추천한 2곳 지도에서 보기', to: '/places?office=msys&picks=1' },
    ])
  })

  it('고른 장소가 없으면 사업장만 실어 기존 라벨을 지킨다', () => {
    const actions: ChatAction[] = [{ type: 'navigate', label: '책 읽기 좋은 장소 보기', to: '/places' }]

    expect(withPlaceAction(actions, { officeKey: 'msys', places: [] })).toEqual([
      { type: 'navigate', label: '책 읽기 좋은 장소 보기', to: '/places?office=msys' },
    ])
  })

  it('추천이 없으면 액션을 그대로 둔다', () => {
    const actions: ChatAction[] = [
      { type: 'navigate', label: '내 서재에서 확인하기', to: '/my' },
      { type: 'reply', label: '네', send: '네' },
    ]
    expect(withPlaceAction(actions, null)).toEqual(actions)
  })

  it('다른 버튼은 순서를 지키며 그대로 둔다', () => {
    const actions: ChatAction[] = [
      { type: 'navigate', label: '책 읽기 좋은 장소 보기', to: '/places' },
      { type: 'reply', label: '다른 곳도 알려줘', send: '다른 곳도 알려줘' },
    ]

    expect(withPlaceAction(actions, rec)).toEqual([
      { type: 'navigate', label: '추천한 2곳 지도에서 보기', to: '/places?office=msys&picks=1' },
      { type: 'reply', label: '다른 곳도 알려줘', send: '다른 곳도 알려줘' },
    ])
  })
})
