import { clubService } from '../../../services/clubService'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 초대 수락/거절. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isFinite(id)) throw new ApiError(400, '잘못된 모임 번호예요')

    const body = await readBody<{ accept?: unknown }>(event)
    if (typeof body?.accept !== 'boolean') throw new ApiError(400, '수락 여부가 필요해요')

    return clubService.respond(id, me.id, body.accept)
  })
)
