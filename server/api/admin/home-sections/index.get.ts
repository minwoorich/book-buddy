import { homeSectionRepo } from '../../../repositories/homeSectionRepo'
import { handleApi, requireAdmin } from '../../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    return homeSectionRepo.listAll()
  })
)
