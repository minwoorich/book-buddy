import { clubChatService } from '../../../../services/clubChatService'
import { handleApi, requireUser, requireIdParam } from '../../../../utils/api'

/** 채팅 기록 — 최근 50개, before로 위로. 참가자만. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const q = getQuery(event)
    const before = typeof q.before === 'string' && /^\d+$/.test(q.before) ? Number(q.before) : null
    const limit = typeof q.limit === 'string' && /^\d+$/.test(q.limit) ? Number(q.limit) : undefined
    return clubChatService.list(id, me.id, { before, limit })
  })
)
