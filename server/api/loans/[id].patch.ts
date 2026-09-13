import { loanService } from '../../services/loanService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const loanId = Number(getRouterParam(event, 'id'))
    const { returned } = await readBody<{ returned?: boolean }>(event)
    if (returned !== true) throw new ApiError(400, '지원하지 않는 변경이에요')

    return loanService.return_(me.id, loanId, { asAdmin: me.role === 'admin' })
  })
)
