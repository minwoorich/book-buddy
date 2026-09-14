import { aiSettingsRepo } from '../../../repositories/aiSettingsRepo'
import { handleApi, requireAdmin } from '../../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    return aiSettingsRepo.listAll()
  })
)
