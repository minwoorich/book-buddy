import { clubService } from '../../../services/clubService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 시간 투표(다중 선택). 저장할 때마다 그 사람의 표를 통째로 바꾼다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ slotIdxs?: unknown }>(event)
    if (!Array.isArray(body?.slotIdxs)) throw new ApiError(400, '가능한 시간을 골라주세요')
    const slotIdxs = body.slotIdxs.filter((v): v is number => typeof v === 'number').slice(0, 10)
    return clubService.vote(id, me.id, slotIdxs)
  })
)
