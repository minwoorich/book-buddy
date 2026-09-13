import { loanRepo } from '../../repositories/loanRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const q = getQuery(event)

    const queryUserId = typeof q.userId === 'string' ? Number(q.userId) : undefined
    let userId: number | undefined
    if (queryUserId !== undefined) {
      if (queryUserId !== me.id && me.role !== 'admin') throw new ApiError(403, '권한이 없어요')
      userId = queryUserId
    } else if (me.role !== 'admin') {
      userId = me.id
    }
    // userId 생략 + admin이면 userId는 undefined로 남아 전체 목록을 조회한다.

    const active = q.active === 'true'
    const returned = q.returned === 'true'
    const from = typeof q.from === 'string' ? q.from : undefined
    const to = typeof q.to === 'string' ? q.to : undefined
    const recent = typeof q.recent === 'string' ? Number(q.recent) : undefined

    return loanRepo.findWithBook({ userId, active, returned, returnedFrom: from, returnedTo: to, limit: recent })
  })
)
