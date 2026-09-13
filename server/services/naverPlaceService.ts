// 네이버 지역(장소) 검색 API 클라이언트.
//
// naverBookService와 동일하게 키를 전역에서 읽지 않고 순수 함수의 첫 인자로 받는다 —
// 호출부(Nitro API 핸들러 등)가 useRuntimeConfig()에서 읽은 키를 넘긴다.

import type { Place } from '../../shared/types'
import { stripHtml } from '../utils/text'

const BASE_URL = 'https://openapi.naver.com/v1/search/local.json'

interface NaverLocalRawItem {
  title?: string
  category?: string
  address?: string
  roadAddress?: string
  mapx?: string
  mapy?: string
}

interface NaverLocalResponse {
  errorCode?: string
  errorMessage?: string
  items?: NaverLocalRawItem[]
}

/**
 * 지역 검색 API의 mapx/mapy는 KATECH이 아니라 WGS84 좌표에 1e7을 곱한 정수 문자열이다.
 * 1e7로 나누면 그대로 경도(mapx)/위도(mapy)가 된다.
 */
function toPlace(raw: NaverLocalRawItem): Place {
  const mapx = Number(raw.mapx ?? 0)
  const mapy = Number(raw.mapy ?? 0)
  return {
    name: stripHtml(raw.title),
    category: raw.category ?? '',
    address: raw.roadAddress || raw.address || '',
    mapx,
    mapy,
    lng: mapx / 1e7,
    lat: mapy / 1e7,
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

export const naverPlaceService = {
  /** 키워드로 장소(카페/도서관/공원 등)를 검색한다. */
  async search(clientId: string, clientSecret: string, query: string, display = 5): Promise<Place[]> {
    const url = new URL(BASE_URL)
    url.searchParams.set('query', query)
    url.searchParams.set('display', String(display))

    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    })

    const text = await res.text()
    let data: NaverLocalResponse
    try {
      data = JSON.parse(text) as NaverLocalResponse
    } catch {
      throw new Error(`네이버 지역 검색 API 응답을 해석할 수 없어요: ${text.slice(0, 200)}`)
    }

    if (!res.ok || data.errorCode) {
      const detail = [data.errorCode, data.errorMessage].filter(Boolean).join(': ')
      throw new Error(`네이버 지역 검색 API 오류 (HTTP ${res.status})${detail ? ` ${detail}` : ''}`)
    }

    return (data.items ?? []).map(toPlace)
  },
}
