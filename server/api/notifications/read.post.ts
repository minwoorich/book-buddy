import { notificationRepo } from '../../repositories/notificationRepo'
import { handleApi, requireUser } from '../../utils/api'

/** 읽음 처리. body의 ids를 주면 그것만, 없으면 전부. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const body = await readBody<{ ids?: unknown }>(event)

    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : undefined

    notificationRepo.markRead(me.id, ids)
    return { unread: notificationRepo.unreadCount(me.id) }
  })
)
