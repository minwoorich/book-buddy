import { describe, it, expect } from 'vitest'
import {
  placeKey,
  toMapPins,
  deOverlapPoints,
  minPairDistance,
  PIN_OVERLAP_PX,
} from '../shared/utils/placeKey'
import type { Place } from '../shared/types'

function place(over: Partial<Place> & { name: string }): Place {
  return {
    category: '카페',
    address: '경기 화성시 동탄구 삼성1로 209',
    mapx: 0,
    mapy: 0,
    lat: 37.2218,
    lng: 127.0749,
    ...over,
  }
}

describe('placeKey', () => {
  it('카카오 장소 id가 있으면 그것을 쓴다', () => {
    expect(placeKey(place({ name: '카페인사이드', kakaoId: '123' }))).toBe('123')
  })

  it('id가 없는 폴백 예시 장소는 이름으로 식별한다', () => {
    expect(placeKey(place({ name: '동학산공원' }))).toBe('동학산공원')
  })
})

describe('toMapPins', () => {
  it('핀 번호는 우측 목록 순번(1-기반)과 같다', () => {
    const pins = toMapPins([
      place({ name: 'A' }),
      place({ name: 'B' }),
      place({ name: 'C' }),
    ])
    expect(pins.map((p) => p.no)).toEqual([1, 2, 3])
  })

  it('좌표 없는 장소를 걸러도 뒤 번호가 밀리지 않는다', () => {
    // 이게 "목록은 1·2·3인데 지도는 다른 번호"로 보이던 버그의 핵심이다.
    // 거른 뒤 번호를 다시 매기면 C가 2번이 되어 목록의 3번과 어긋난다.
    const pins = toMapPins([
      place({ name: 'A' }),
      place({ name: 'B', lat: 0, lng: 0 }),
      place({ name: 'C' }),
    ])
    expect(pins.map((p) => [p.place.name, p.no])).toEqual([
      ['A', 1],
      ['C', 3],
    ])
  })

  it('첫 장소가 좌표 없음이어도 나머지는 제 번호를 지킨다', () => {
    const pins = toMapPins([
      place({ name: 'A', lat: 0, lng: 0 }),
      place({ name: 'B' }),
    ])
    expect(pins).toHaveLength(1)
    expect(pins[0]!.no).toBe(2)
  })

  it('NaN 좌표도 지도에 올리지 않는다', () => {
    const pins = toMapPins([place({ name: 'A', lat: Number.NaN, lng: 127 })])
    expect(pins).toHaveLength(0)
  })
})

describe('deOverlapPoints', () => {
  const EPS = 0.001

  it('같은 건물의 장소들을 서로 안 가리게 떼어놓는다', () => {
    // 실제 증상 재현: 상위 3곳이 모두 "삼성1로 209" — 화면에서 몇 px 차이로 포개진다.
    const placed = deOverlapPoints([
      { no: 1, x: 400, y: 300 },
      { no: 2, x: 402, y: 301 },
      { no: 3, x: 399, y: 303 },
      { no: 9, x: 560, y: 480 },
    ])
    expect(minPairDistance(placed)).toBeGreaterThanOrEqual(PIN_OVERLAP_PX - EPS)
  })

  it('좌표가 완전히 같아도 겹침이 풀린다', () => {
    // 방향 벡터가 0이라 순진한 밀어내기는 여기서 멈춘다 — 미세 오프셋이 필요한 이유.
    const placed = deOverlapPoints([
      { no: 1, x: 500, y: 400 },
      { no: 2, x: 500, y: 400 },
      { no: 3, x: 500, y: 400 },
    ])
    expect(minPairDistance(placed)).toBeGreaterThanOrEqual(PIN_OVERLAP_PX - EPS)
  })

  it('브라우저에서 실측된 8.9px 겹침을 푼다', () => {
    const placed = deOverlapPoints([
      { no: 1, x: 500, y: 400 },
      { no: 4, x: 508.9, y: 400 },
    ])
    expect(minPairDistance(placed)).toBeGreaterThanOrEqual(PIN_OVERLAP_PX - EPS)
  })

  it('무리끼리 벌어지다 다시 부딪히는 경우까지 푼다', () => {
    // 무리별로 원형 배치만 하던 방식이 실패했던 형태(실측 18.9px). 서로 다른 덩어리의
    // 핀이 바깥으로 벌어지다 부딪힌다 — 모든 쌍을 보는 완화 방식은 여기서도 성립해야 한다.
    const placed = deOverlapPoints([
      { no: 1, x: 300, y: 300 },
      { no: 2, x: 305, y: 302 },
      { no: 3, x: 302, y: 297 },
      { no: 4, x: 348, y: 300 },
      { no: 5, x: 352, y: 303 },
      { no: 6, x: 350, y: 296 },
    ])
    expect(minPairDistance(placed)).toBeGreaterThanOrEqual(PIN_OVERLAP_PX - EPS)
  })

  it('이미 충분히 떨어진 핀은 움직이지 않는다', () => {
    const input = [
      { no: 1, x: 100, y: 100 },
      { no: 2, x: 400, y: 400 },
    ]
    const placed = deOverlapPoints(input)
    expect(placed[0]!.x).toBeCloseTo(100, 1)
    expect(placed[1]!.y).toBeCloseTo(400, 1)
  })

  it('핀을 잃거나 중복시키지 않는다', () => {
    const input = [
      { no: 1, x: 400, y: 300 },
      { no: 2, x: 400, y: 300 },
      { no: 3, x: 900, y: 700 },
    ]
    const placed = deOverlapPoints(input)
    expect(placed).toHaveLength(3)
    expect(placed.map((p) => p.item.no).sort()).toEqual([1, 2, 3])
  })

  it('같은 입력이면 늘 같은 배치가 나온다(무작위 금지)', () => {
    const input = [
      { no: 1, x: 500, y: 400 },
      { no: 2, x: 500, y: 400 },
      { no: 3, x: 501, y: 400 },
    ]
    const a = deOverlapPoints(input).map((p) => [p.x, p.y])
    const b = deOverlapPoints(input).map((p) => [p.x, p.y])
    expect(a).toEqual(b)
  })

  it('12곳이 모두 한 점에 몰려도 전부 풀린다', () => {
    const input = Array.from({ length: 12 }, (_, i) => ({ no: i + 1, x: 600, y: 450 }))
    const placed = deOverlapPoints(input)
    expect(minPairDistance(placed)).toBeGreaterThanOrEqual(PIN_OVERLAP_PX - EPS)
  })

  it('핀이 원래 위치에서 지나치게 멀어지지 않는다', () => {
    // 겹침을 푸느라 장소가 엉뚱한 블록으로 옮겨가면 지도로서 거짓말이 된다.
    const input = Array.from({ length: 5 }, (_, i) => ({ no: i + 1, x: 600, y: 450 }))
    const placed = deOverlapPoints(input)
    for (const p of placed) {
      expect(Math.hypot(p.x - 600, p.y - 450)).toBeLessThan(60)
    }
  })

  describe('장애물(사업장 마커)', () => {
    const anchors = [{ x: 500, y: 400, radius: 46 }]

    it('사업장 마커 뒤에 숨은 핀을 밖으로 밀어낸다', () => {
      // 브라우저 검증에서 6번 핀이 "바텍네트웍스 본사" 라벨에 통째로 가려졌다.
      const placed = deOverlapPoints([{ no: 6, x: 505, y: 402 }], { anchors })
      expect(Math.hypot(placed[0]!.x - 500, placed[0]!.y - 400)).toBeGreaterThanOrEqual(45.9)
    })

    it('핀이 마커 정중앙에 있어도(방향 없음) 밀려난다', () => {
      const placed = deOverlapPoints(
        [
          { no: 1, x: 500, y: 400 },
          { no: 2, x: 500, y: 400 },
        ],
        { anchors }
      )
      for (const p of placed) {
        expect(Math.hypot(p.x - 500, p.y - 400)).toBeGreaterThanOrEqual(45.9)
      }
      expect(minPairDistance(placed)).toBeGreaterThanOrEqual(PIN_OVERLAP_PX - EPS)
    })

    it('장애물을 피하면서 핀끼리 겹침도 함께 푼다', () => {
      const placed = deOverlapPoints(
        Array.from({ length: 6 }, (_, i) => ({ no: i + 1, x: 502, y: 401 })),
        { anchors }
      )
      expect(minPairDistance(placed)).toBeGreaterThanOrEqual(PIN_OVERLAP_PX - EPS)
      for (const p of placed) {
        expect(Math.hypot(p.x - 500, p.y - 400)).toBeGreaterThanOrEqual(45.9)
      }
    })

    it('멀리 있는 핀은 장애물이 건드리지 않는다', () => {
      const placed = deOverlapPoints([{ no: 1, x: 900, y: 800 }], { anchors })
      expect(placed[0]!.x).toBeCloseTo(900, 1)
      expect(placed[0]!.y).toBeCloseTo(800, 1)
    })
  })
})
