import { homeSectionRepo } from '../../../repositories/homeSectionRepo'
import { handleApi, requireAdmin } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    const { enabled, sortOrder } = await readBody<{ enabled?: boolean; sortOrder?: number }>(event)

    const existing = homeSectionRepo.findById(id)
    if (!existing) throw new ApiError(404, '없는 섹션이에요')

    return homeSectionRepo.update(id, { enabled, sortOrder })!
  })
)
