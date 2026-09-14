import { kakaoLocalService } from '../../services/kakaoLocalService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { Place } from '../../../shared/types'

const DEFAULT_QUERIES = ['용인 수지 카페', '용인 수지 도서관', '용인 수지 공원']
// 기준 좌표(내 위치)가 있으면 지역명 없이 반경 검색한다 — 사용자가 수지에 없어도 동작해야 한다.
const NEARBY_QUERIES = ['카페', '도서관', '공원']
const MAX_PLACES = 12

export default defineEventHandler(
  handleApi(async (event): Promise<Place[]> => {
    requireUser(event)
    const q = getQuery(event)
    const query = typeof q.query === 'string' ? q.query.trim() : ''
    const lat = Number(q.lat)
    const lng = Number(q.lng)
    const origin =
      Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
        ? { lat, lng }
        : undefined

    const { kakaoRestKey } = useRuntimeConfig(event)
    if (!kakaoRestKey) {
      throw new ApiError(503, '장소 검색을 사용할 수 없어요')
    }

    const queries = query ? [query] : origin ? NEARBY_QUERIES : DEFAULT_QUERIES
    const results = await Promise.all(
      queries.map((keyword) => kakaoLocalService.search(kakaoRestKey, keyword, 5, origin))
    )

    // 이름 기준 중복 제거(먼저 나온 검색 결과를 우선).
    const merged = new Map<string, Place>()
    for (const list of results) {
      for (const place of list) {
        if (!merged.has(place.name)) merged.set(place.name, place)
      }
    }

    const places = [...merged.values()]
    // 기준 좌표가 있으면 카테고리별 병합 후에도 전체를 거리순으로 다시 정렬한다.
    if (origin) places.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))

    return places.slice(0, MAX_PLACES)
  })
)
