import { clubChatService } from '../../../../services/clubChatService'
import { handleApi, requireUser, requireIdParam } from '../../../../utils/api'

/** 메시지 보내기 — 저장 후 스트림 구독자에게 밀어준다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ body?: unknown }>(event)
    return clubChatService.send(id, me.id, typeof body?.body === 'string' ? body.body : '')
  })
)
