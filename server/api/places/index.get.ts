import { kakaoLocalService } from '../../services/kakaoLocalService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import { VATECH_HQ } from '../../../shared/constants/company'
import type { Place } from '../../../shared/types'

// 기본 목록은 바텍네트웍스 본사 반경(5km) 안의 카페·도서관·공원을 거리순으로 찾는다.
// 사용자가 내 위치를 주면 그 좌표가 원점이 된다. 키워드 검색은 지역 제한 없이(내 위치가 있을 때만 반경).
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

    const queries = query ? [query] : NEARBY_QUERIES
    const searchOrigin = origin ?? (query ? undefined : { lat: VATECH_HQ.lat, lng: VATECH_HQ.lng })
    const results = await Promise.all(
      queries.map((keyword) => kakaoLocalService.search(kakaoRestKey, keyword, 5, searchOrigin))
    )

    // 이름 기준 중복 제거(먼저 나온 검색 결과를 우선).
    const merged = new Map<string, Place>()
    for (const list of results) {
      for (const place of list) {
        if (!merged.has(place.name)) merged.set(place.name, place)
      }
    }

    const places = [...merged.values()]
    // 기준 좌표(내 위치 또는 본사)가 있으면 카테고리별 병합 후에도 전체를 거리순으로 다시 정렬한다.
    if (searchOrigin) places.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))

    return places.slice(0, MAX_PLACES)
  })
)
