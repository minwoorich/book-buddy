import { clubRecruitService } from '../../../services/clubRecruitService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 개설자가 사람을 초대한다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ userIds?: unknown }>(event)
    if (!Array.isArray(body?.userIds)) throw new ApiError(400, '초대할 사람이 필요해요')
    const userIds = body.userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    return clubRecruitService.invite(id, me.id, userIds)
  })
)
