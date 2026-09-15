// 카카오 로컬(장소) 검색 API 클라이언트.
//
// kakaoBookService와 동일하게 키를 전역에서 읽지 않고 순수 함수의 첫 인자로 받는다 —
// 호출부(Nitro API 핸들러 등)가 useRuntimeConfig()에서 읽은 키를 넘긴다.

import type { Place } from '../../shared/types'
import { stripHtml } from '../utils/text'

const BASE_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json'

interface KakaoLocalRawItem {
  place_name?: string
  category_name?: string
  road_address_name?: string
  address_name?: string
  x?: string
  y?: string
  distance?: string
}

interface KakaoLocalResponse {
  documents?: KakaoLocalRawItem[]
}

interface KakaoErrorResponse {
  errorType?: string
  message?: string
}

/** 유한하지 않은 값(NaN/Infinity)은 0으로 가드한다. */
function safeNumber(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** `category_name`(예: `여행 > 관광,명소 > 카페`)의 마지막 세그먼트만 취한다. */
function lastCategorySegment(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.split('>').map((s) => s.trim())
  return parts[parts.length - 1] ?? ''
}

/**
 * 카카오 로컬 검색의 x/y는 각각 경도(lng)/위도(lat) 문자열(WGS84)이다.
 * Place 타입은 이전 지역 검색 연동 시절의 mapx/mapy(WGS84 * 1e7 정수) 필드를 그대로 유지하므로,
 * lat/lng에 1e7을 곱해 역산한 값을 채워 호환성을 지킨다.
 */
function toPlace(raw: KakaoLocalRawItem): Place {
  const lng = safeNumber(raw.x)
  const lat = safeNumber(raw.y)
  const distance = Number(raw.distance)
  return {
    name: stripHtml(raw.place_name),
    category: lastCategorySegment(raw.category_name),
    address: raw.road_address_name || raw.address_name || '',
    mapx: Math.round(lng * 1e7),
    mapy: Math.round(lat * 1e7),
    lng,
    lat,
    // distance는 x/y(기준 좌표)를 준 검색에서만 내려오는 미터 문자열이다.
    ...(Number.isFinite(distance) && distance > 0 ? { distanceM: distance } : {}),
  }
}

/**
 * AI가 반환한 (name, reason) 순위 목록을 원본 Place 배열에 병합하는 순수 함수. name 매칭으로
 * ranked 순서를 따르며, name이 원본에 없거나(매칭 실패) 이미 사용된 name(AI가 중복 반환)은
 * 건너뛴다. ranked에 없는 장소는 원본 순서 그대로 뒤에 이어붙이고 reason은 빈 문자열로 채운다.
 */
export function mergeRanking(
  places: Place[],
  ranked: { name: string; reason: string }[]
): (Place & { reason: string })[] {
  const byName = new Map(places.map((p) => [p.name, p]))
  const used = new Set<string>()
  const result: (Place & { reason: string })[] = []

  for (const r of ranked) {
    const place = byName.get(r.name)
    if (!place || used.has(r.name)) continue
    used.add(r.name)
    result.push({ ...place, reason: r.reason })
  }
  for (const place of places) {
    if (!used.has(place.name)) result.push({ ...place, reason: '' })
  }

  return result
}

export const kakaoLocalService = {
  /**
   * 키워드로 장소(카페/도서관/공원 등)를 검색한다.
   * origin(WGS84 좌표)을 주면 그 지점 반경 내에서 거리순으로 검색하고, 각 결과에
   * distanceM(미터)이 채워진다 — "내 위치 근처" 검색용.
   */
  async search(
    restKey: string,
    query: string,
    display = 5,
    origin?: { lat: number; lng: number },
    radiusM = 5000
  ): Promise<Place[]> {
    const url = new URL(BASE_URL)
    url.searchParams.set('query', query)
    url.searchParams.set('size', String(display))
    if (origin) {
      url.searchParams.set('x', String(origin.lng))
      url.searchParams.set('y', String(origin.lat))
      // 카카오 허용 범위 0~20000m
      url.searchParams.set('radius', String(Math.min(Math.max(Math.round(radiusM), 0), 20000)))
      url.searchParams.set('sort', 'distance')
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `KakaoAK ${restKey}`,
      },
    })

    const text = await res.text()

    if (!res.ok) {
      let detail = ''
      try {
        const errData = JSON.parse(text) as KakaoErrorResponse
        detail = [errData.errorType, errData.message].filter(Boolean).join(': ')
      } catch {
        detail = text.slice(0, 200)
      }
      const keyHint = res.status === 401 || res.status === 403 ? ' (REST API 키가 올바른지 확인해주세요)' : ''
      throw new Error(`카카오 장소 검색 API 오류 (HTTP ${res.status})${detail ? ` ${detail}` : ''}${keyHint}`)
    }

    let data: KakaoLocalResponse
    try {
      data = JSON.parse(text) as KakaoLocalResponse
    } catch {
      throw new Error(`카카오 장소 검색 API 응답을 해석할 수 없어요: ${text.slice(0, 200)}`)
    }

    return (data.documents ?? []).map(toPlace)
  },
}
