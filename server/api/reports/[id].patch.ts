import { reportRepo } from '../../repositories/reportRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    const { status } = await readBody<{ status?: string }>(event)
    if (status !== 'resolved') throw new ApiError(400, '지원하지 않는 상태예요')

    const existing = reportRepo.findById(id)
    if (!existing) throw new ApiError(404, '없는 신고예요')

    reportRepo.updateStatus(id, 'resolved')
    return reportRepo.findById(id)!
  })
)
