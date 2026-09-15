import { loanService } from '../../services/loanService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const loanId = Number(getRouterParam(event, 'id'))
    const { returned } = await readBody<{ returned?: boolean }>(event)
    if (returned !== true) throw new ApiError(400, '지원하지 않는 변경이에요')

    // 대출 직후 반납은 실수 대출 취소로 처리한다(QA #28) — canceled로 구분해 내려준다.
    const result = loanService.returnOrCancel(me.id, loanId, { asAdmin: me.role === 'admin' })
    return { canceled: result.canceled, ...(result.loan ?? {}) }
  })
)
