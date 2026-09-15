import type { Place, PlaceReviewSummary, ReviewedPlace } from '../../../shared/types'
import { PLACE_TAGS, PLACE_TAG_LABEL, type PlaceTagCode } from '../../../shared/constants/placeTags'

/**
 * AI 도구가 내보내는 후기 요약. 모델이 읽을 값이라 코드(quiet) 대신 사람 말(조용해요)을 쓰고,
 * 코멘트에는 남긴 사람과 부서를 붙여 "누가 그랬는지"까지 근거로 들 수 있게 한다.
 */
export interface ReviewDigest {
  total: number
  /** 태그 라벨 → 개수. 많은 순, 같으면 PLACE_TAGS 정의 순. */
  tags: Record<string, number>
  comments: string[]
}

export interface AgentPlace {
  name: string
  category: string
  address: string
  distanceM: number | null
  mapUrl: string
  /** 사내 후기가 0건이면 키 자체가 없다 — 모델이 없는 근거를 지어내지 않도록. */
  reviews?: ReviewDigest
}

export interface AgentReviewedPlace {
  name: string
  total: number
  tags: Record<string, number>
  comments: string[]
  mapUrl: string
}

const TAG_ORDER = new Map<PlaceTagCode, number>(PLACE_TAGS.map((t, i) => [t.code, i]))

/** tagCounts(코드 → 개수)를 라벨 → 개수로 바꾸고 개수 많은 순으로 정렬한다. */
function toTagLabels(tagCounts: Partial<Record<PlaceTagCode, number>>): Record<string, number> {
  const entries = Object.entries(tagCounts) as [PlaceTagCode, number][]
  entries.sort((a, b) => b[1] - a[1] || (TAG_ORDER.get(a[0]) ?? 99) - (TAG_ORDER.get(b[0]) ?? 99))
  return Object.fromEntries(entries.map(([code, count]) => [PLACE_TAG_LABEL[code], count]))
}

/**
 * 카카오 검색 결과에 사내 장소 후기 요약을 붙여 AI가 읽을 형태로 만든다.
 * 요약은 kakaoId로 맞춰 붙이므로 배열 순서가 달라도, 폴백 장소처럼 kakaoId가 없어도 안전하다.
 */
export function toAgentPlaces(places: Place[], summaries: PlaceReviewSummary[]): AgentPlace[] {
  const byId = new Map(summaries.map((s) => [s.kakaoPlaceId, s]))
  return places.map((p) => {
    const summary = p.kakaoId ? byId.get(p.kakaoId) : undefined
    return {
      name: p.name,
      category: p.category,
      address: p.address,
      distanceM: p.distanceM ?? null,
      mapUrl: `https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat},${p.lng}`,
      ...(summary && summary.total > 0
        ? {
            reviews: {
              total: summary.total,
              tags: toTagLabels(summary.tagCounts),
              comments: summary.recent.map((r) => `${r.userName}(${r.department}): ${r.comment}`),
            },
          }
        : {}),
    }
  })
}

/** 후기만으로 고른 장소(topPlaces 결과)를 AI가 읽을 형태로. 링크는 카카오맵 장소 상세. */
export function toAgentReviewedPlaces(places: ReviewedPlace[]): AgentReviewedPlace[] {
  return places.map((p) => ({
    name: p.placeName,
    total: p.total,
    tags: toTagLabels(p.tagCounts),
    comments: p.recentComments,
    mapUrl: `https://place.map.kakao.com/${p.kakaoPlaceId}`,
  }))
}
