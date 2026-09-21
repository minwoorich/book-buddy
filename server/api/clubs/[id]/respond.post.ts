import { clubService } from '../../../services/clubService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 초대 수락/거절. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')

    const body = await readBody<{ accept?: unknown }>(event)
    if (typeof body?.accept !== 'boolean') throw new ApiError(400, '수락 여부가 필요해요')

    return clubService.respond(id, me.id, body.accept)
  })
)
