import { clubChatService } from '../../../../services/clubChatService'
import { handleApi, requireUser, requireIdParam } from '../../../../utils/api'

/** 여기까지 읽었어요. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ lastReadId?: unknown }>(event)
    clubChatService.markRead(id, me.id, Number(body?.lastReadId))
    return { ok: true }
  })
)
