import type { Place } from '#shared/types'

/** 장소 목록과 지도 위 요약 카드가 함께 쓰는 표시용 헬퍼. */

/** (0,0)은 폴백 예시의 좌표 없음 표시 — 지도 링크를 만들 수 없다. */
export function hasCoords(place: Place): boolean {
  return place.lat !== 0 || place.lng !== 0
}

/** "카카오맵에서 보기"는 장소 상세 페이지(placeUrl, 카카오 리뷰가 있는 곳)를 우선하고, 없으면 좌표 링크. */
export function kakaoMapUrl(place: Place, kind: 'map' | 'to'): string {
  if (kind === 'map' && place.placeUrl) return place.placeUrl
  return `https://map.kakao.com/link/${kind}/${encodeURIComponent(place.name)},${place.lat},${place.lng}`
}

export function formatDistance(m?: number): string {
  if (!m) return ''
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

/**
 * 요약 카드가 지도 아래쪽을 덮는 높이(px). 지도는 선택한 핀을 이만큼 위로 올려 세워
 * 카드 뒤에 숨지 않게 한다.
 *
 * 좁은 화면일수록 카드가 가로로 꽉 차고 지도도 낮아(380~300px) 가림이 심하다.
 * PC(>900px)에서는 카드가 지도 왼쪽 아래 구석에만 뜨고 핀은 가운데라 겹치지 않는다.
 */
export function cardCoverPx(viewportWidth: number): number {
  if (viewportWidth > 900) return 0
  return viewportWidth <= 640 ? 180 : 160
}
