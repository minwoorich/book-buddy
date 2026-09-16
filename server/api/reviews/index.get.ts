import { reviewRepo } from '../../repositories/reviewRepo'
import { rankingService } from '../../services/rankingService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { ReviewFeed } from '../../../shared/types'

const SORTS = ['popular', 'latest', 'rating'] as const
type Sort = (typeof SORTS)[number]

/** 뱃지를 다는 다독왕 인원 — 랭킹 페이지 포디움과 같은 3명. */
const TOP_READER_COUNT = 3

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * 리뷰 목록.
 * - 기본: 내가 남긴 리뷰(내 서재 섹션용 — QA #25)
 * - `?scope=all`: 전체 리뷰 모아보기(왓챠피디아식 피드) + `sort`(popular|latest|rating)
 *   + 소속 필터(`company`/`department`/`team`) + `topReader=1`(이달의 다독왕 리뷰만) + 요약 통계
 */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const q = getQuery(event)

    if (q.scope === 'all') {
      const sort = (typeof q.sort === 'string' ? q.sort : 'popular') as Sort
      if (!SORTS.includes(sort)) throw new ApiError(400, '지원하지 않는 정렬이에요')

      // 다독왕 판정은 랭킹 서비스(개인·이달)를 그대로 쓴다 — 랭킹 페이지와 어긋나지 않게.
      const topReaders = rankingService.topReaders(TOP_READER_COUNT)
      const rankByUserId = new Map(topReaders.map((t) => [t.userId, t.rank]))

      const reviews = reviewRepo.listAllWithMeta(me.id, {
        sort,
        company: str(q.company),
        department: str(q.department),
        team: str(q.team),
        topReaderIds: q.topReader === '1' ? topReaders.map((t) => t.userId) : undefined,
      })

      const feed: ReviewFeed = {
        stats: reviewRepo.globalStats(),
        reviews: reviews.map((review) => ({
          ...review,
          topReaderRank: rankByUserId.get(review.userId) ?? null,
        })),
        orgs: reviewRepo.orgOptions(),
      }
      return feed
    }

    return reviewRepo.listByUser(me.id)
  })
)
