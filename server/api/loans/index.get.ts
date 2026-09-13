import { loanRepo } from '../../repositories/loanRepo'
import { handleApi, requireUser, parseQueryUserId } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const q = getQuery(event)

    const scopeAll = q.scope === 'all'
    const recent = typeof q.recent === 'string' ? Number(q.recent) : undefined

    const queryUserId = parseQueryUserId(q.userId)
    let userId: number | undefined
    if (queryUserId !== undefined) {
      if (queryUserId !== me.id && me.role !== 'admin') throw new ApiError(403, '권한이 없어요')
      userId = queryUserId
    } else if (scopeAll || recent !== undefined) {
      // 전체 조회는 opt-in(?scope=all 또는 관리자 대시보드의 ?recent=N)이고 admin 전용이다.
      if (me.role !== 'admin') throw new ApiError(403, '권한이 없어요')
      userId = undefined
    } else {
      // userId 생략 + scope=all 아님 → admin이어도 기본은 항상 본인 것만.
      userId = me.id
    }

    const active = q.active === 'true'
    const returned = q.returned === 'true'
    const from = typeof q.from === 'string' ? q.from : undefined
    const to = typeof q.to === 'string' ? q.to : undefined

    return loanRepo.findWithBook({ userId, active, returned, returnedFrom: from, returnedTo: to, limit: recent })
  })
)
