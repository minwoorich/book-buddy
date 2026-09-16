import type { Place } from '../types'

/**
 * 장소 목록·지도 핀이 같은 장소를 가리키는지 판단하는 안정 키.
 *
 * 목록과 지도가 서로 다른 기준으로 장소를 식별하면 "우측 3번을 눌렀는데 지도에선 다른 핀이
 * 켜지는" 어긋남이 생긴다. 양쪽 모두 이 함수 하나만 쓰도록 강제한다. kakaoId는 카카오 장소
 * 고유 id이고, 폴백 예시 장소에는 없으므로 이름으로 대신한다.
 */
export function placeKey(place: Pick<Place, 'name' | 'kakaoId'>): string {
  return place.kakaoId ?? place.name
}

/** 지도에 실제로 찍을 장소 하나 — 번호(no)는 **우측 목록의 번호**와 같아야 한다. */
export interface MapPin<T extends Place = Place> {
  place: T
  /** 우측 목록에서의 1-기반 순번. */
  no: number
  key: string
}

/**
 * 지도에 올릴 장소를 고르고 번호를 매긴다.
 *
 * 핵심은 **거르기 전에 번호를 매긴다**는 것. 좌표가 없는 장소를 먼저 걸러낸 뒤 그 결과에
 * 번호를 다시 매기면, 걸러진 장소 뒤의 핀 번호가 통째로 한 칸씩 밀려 목록과 어긋난다.
 *
 * (0,0)은 좌표 없음의 표시다(폴백 예시 장소). 그대로 두면 마커가 "Null Island"에 찍힌다.
 */
export function toMapPins<T extends Place>(places: readonly T[]): MapPin<T>[] {
  return places
    .map((place, i) => ({ place, no: i + 1, key: placeKey(place) }))
    .filter(
      ({ place }) =>
        Number.isFinite(place.lat) &&
        Number.isFinite(place.lng) &&
        (place.lat !== 0 || place.lng !== 0)
    )
}

/** 핀 머리는 26px(선택 시 38px) — 중심이 이보다 가까우면 서로 가린다. */
export const PIN_OVERLAP_PX = 32

/** 황금각(rad) — 겹친 점들에 고르게 퍼지는 결정론적 방향을 주는 데 쓴다. */
const GOLDEN_ANGLE = 2.399963229728653

/** 겹침을 푼 결과 — 원래 항목과 옮겨진 화면 좌표. */
export interface PlacedPoint<T> {
  item: T
  x: number
  y: number
}

/**
 * 서로를 가리는 핀들을 밀어내 어떤 두 핀도 `gap`보다 가깝지 않게 만든다.
 *
 * 겹침을 풀지 않으면 나중 번호 핀이 앞 번호를 덮어, 목록엔 1·2·3이 있는데 지도엔 5·7·8만
 * 보이는 것처럼 읽힌다(신고된 증상).
 *
 * 위경도가 아니라 **화면 픽셀**에서 푸는 이유: 가리는지 여부는 줌에 따라 달라진다. 위경도를
 * 반올림해 묶으면 같은 건물(수 m 차이)은 잡아도, 반올림 칸 경계에 걸쳐 화면에선 9px로
 * 겹치는 쌍을 놓친다.
 *
 * 무리를 한 번에 원형으로 벌리는 방식도 써봤지만, 서로 다른 무리의 핀이 벌어지다 부딪혀
 * 다시 겹쳤다(실측 18.9px). 그래서 쌍 단위로 조금씩 밀어내는 완화(relaxation)를 반복한다 —
 * 무리의 경계와 무관하게 "모든 쌍이 gap 이상"이라는 조건 하나만 보기 때문에 그런 구멍이 없다.
 */
export interface DeOverlapOptions {
  /** 두 핀 중심 사이 최소 거리(px). */
  gap?: number
  /** 완화 반복 횟수 — 핀이 많고 빽빽할수록 더 필요하다. */
  iterations?: number
  /**
   * 움직이지 않는 장애물(기준 사업장 마커 등). 핀을 밀어내기만 하고 자신은 제자리에 있는다.
   * 사업장 마커는 이름표까지 달려 크므로, 이걸 넣지 않으면 그 뒤에 핀이 숨는다.
   */
  anchors?: readonly { x: number; y: number; radius: number }[]
}

export function deOverlapPoints<T>(
  points: readonly (T & { x: number; y: number })[],
  options: DeOverlapOptions = {}
): PlacedPoint<T>[] {
  const { gap = PIN_OVERLAP_PX, iterations = 48, anchors = [] } = options
  // 완전히 같은 지점이면 밀어낼 방향이 없다 — 황금각으로 결정론적 미세 오프셋을 줘서
  // 방향을 만든다(무작위가 아니라 매번 같은 배치가 나온다).
  const placed: PlacedPoint<T>[] = points.map((item, i) => {
    const angle = i * GOLDEN_ANGLE
    return { item, x: item.x + Math.cos(angle) * 0.01, y: item.y + Math.sin(angle) * 0.01 }
  })

  for (let pass = 0; pass < iterations; pass++) {
    let moved = false

    // 장애물은 밀기만 한다 — 핀 쪽만 움직인다.
    for (const anchor of anchors) {
      placed.forEach((p, i) => {
        let dx = p.x - anchor.x
        let dy = p.y - anchor.y
        let dist = Math.hypot(dx, dy)
        if (dist >= anchor.radius) return
        if (dist < 1e-6) {
          // 장애물 한가운데라 밀어낼 방향이 없다 — 핀마다 다른 고정 방향을 준다.
          const angle = i * GOLDEN_ANGLE
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          dist = 1
        }
        const push = anchor.radius - dist
        p.x += (dx / dist) * push
        p.y += (dy / dist) * push
        moved = true
      })
    }

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!
        const b = placed[j]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 1e-6
        if (dist >= gap) continue
        const push = (gap - dist) / 2
        const ux = dx / dist
        const uy = dy / dist
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
        moved = true
      }
    }
    if (!moved) break // 더 겹치는 쌍이 없다 — 일찍 끝낸다.
  }
  return placed
}

/** 어떤 두 점도 `gap`보다 가깝지 않은지 — 검증·테스트용. */
export function minPairDistance(points: readonly { x: number; y: number }[]): number {
  let min = Infinity
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(min, Math.hypot(points[j]!.x - points[i]!.x, points[j]!.y - points[i]!.y))
    }
  }
  return min
}
