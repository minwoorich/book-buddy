import { clubService } from '../services/clubService'

/**
 * 매일 아침 초대 기한을 정리한다.
 * 만료 처리를 먼저 하고 리마인드를 보낸다 — 순서가 반대면 오늘 취소될 모임에도
 * "내일 마감돼요" 알림이 나간다.
 */
export default defineTask({
  meta: {
    name: 'club:deadlines',
    description: '책모임 초대 기한을 정리하고 마감 임박 알림을 보낸다',
  },
  run() {
    try {
      const now = new Date()
      const handled = clubService.expireInvites(now)
      const reminded = clubService.remindExpiringInvites(now)
      console.log(`[club:deadlines] 만료 ${handled}건 처리, 마감 임박 알림 ${reminded}명`)
      return { result: { handled, reminded } }
    } catch (e) {
      console.error('[club:deadlines] 실패', e)
      return { result: { handled: 0, reminded: 0 } }
    }
  },
})
