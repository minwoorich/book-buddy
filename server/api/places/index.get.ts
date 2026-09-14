import { kakaoLocalService } from '../../services/kakaoLocalService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { Place } from '../../../shared/types'

const DEFAULT_QUERIES = ['용인 수지 카페', '용인 수지 도서관', '용인 수지 공원']
const MAX_PLACES = 12

export default defineEventHandler(
  handleApi(async (event): Promise<Place[]> => {
    requireUser(event)
    const q = getQuery(event)
    const query = typeof q.query === 'string' ? q.query.trim() : ''

    const { kakaoRestKey } = useRuntimeConfig(event)
    if (!kakaoRestKey) {
      throw new ApiError(503, '장소 검색을 사용할 수 없어요')
    }

    const queries = query ? [query] : DEFAULT_QUERIES
    const results = await Promise.all(queries.map((q) => kakaoLocalService.search(kakaoRestKey, q, 5)))

    // 이름 기준 중복 제거(먼저 나온 검색 결과를 우선).
    const merged = new Map<string, Place>()
    for (const list of results) {
      for (const place of list) {
        if (!merged.has(place.name)) merged.set(place.name, place)
      }
    }

    return [...merged.values()].slice(0, MAX_PLACES)
  })
)
