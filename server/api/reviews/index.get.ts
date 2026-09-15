import { reviewRepo } from '../../repositories/reviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

const SORTS = ['popular', 'latest', 'rating'] as const
type Sort = (typeof SORTS)[number]

/**
 * 리뷰 목록.
 * - 기본: 내가 남긴 리뷰(내 서재 섹션용 — QA #25)
 * - `?scope=all`: 전체 리뷰 모아보기(왓챠피디아식 피드) + `sort`(popular|latest|rating) + 요약 통계
 */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const q = getQuery(event)

    if (q.scope === 'all') {
      const sort = (typeof q.sort === 'string' ? q.sort : 'popular') as Sort
      if (!SORTS.includes(sort)) throw new ApiError(400, '지원하지 않는 정렬이에요')
      return {
        stats: reviewRepo.globalStats(),
        reviews: reviewRepo.listAllWithMeta(me.id, sort),
      }
    }

    return reviewRepo.listByUser(me.id)
  })
)
