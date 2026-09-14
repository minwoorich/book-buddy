import { aiUsageRepo } from '../../../repositories/aiUsageRepo'
import { handleApi, requireAdmin } from '../../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    return { summary: aiUsageRepo.summary(), recent: aiUsageRepo.recent(20) }
  })
)
