import { notificationRepo } from '../../repositories/notificationRepo'
import { handleApi, requireUser } from '../../utils/api'

/** 내 알림 목록 + 미확인 수. 헤더 벨이 주기적으로 폴링한다. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    return {
      items: notificationRepo.listForUser(me.id),
      unread: notificationRepo.unreadCount(me.id),
    }
  })
)
