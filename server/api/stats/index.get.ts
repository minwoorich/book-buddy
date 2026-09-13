import { statsService, STATS_BY_VALUES, type StatsBy } from '../../services/statsService'
import { PERIOD_VALUES, type Period } from '../../services/rankingService'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const q = getQuery(event)

    const by = (typeof q.by === 'string' ? q.by : 'department') as StatsBy
    const period = (typeof q.period === 'string' ? q.period : 'month') as Period
    if (!STATS_BY_VALUES.includes(by) || !PERIOD_VALUES.includes(period)) {
      throw new ApiError(400, '지원하지 않는 기준이에요')
    }

    return statsService.byGroup(by, period)
  })
)
