import { rankingService, RANK_BY_VALUES, PERIOD_VALUES, type RankBy, type Period } from '../../services/rankingService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    requireUser(event)
    const q = getQuery(event)

    const by = (typeof q.by === 'string' ? q.by : 'user') as RankBy
    const period = (typeof q.period === 'string' ? q.period : 'month') as Period
    if (!RANK_BY_VALUES.includes(by) || !PERIOD_VALUES.includes(period)) {
      throw new ApiError(400, '지원하지 않는 기준이에요')
    }

    // 30분 스냅샷 + 갱신 시각(QA #56). 응답은 { rows, updatedAt, nextUpdateAt }.
    return rankingService.snapshot(by, period)
  })
)
