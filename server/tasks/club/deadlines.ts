import { clubService } from '../../services/clubService'

/**
 * 매일 아침 초대 기한을 정리한다.
 * 만료 처리를 먼저 하고 리마인드를 보낸다 — 순서가 반대면 오늘 취소될 모임에도
 * "내일 마감돼요" 알림이 나간다.
 */
export default defineTask({
  meta: {
    name: 'club:deadlines',
    description: '책모임 기한 정리 — 초대 만료·투표 마감·종료·리마인드',
  },
  run() {
    try {
      const now = new Date()
      // 순서가 중요하다: 만료·마감·종료를 먼저 정리하고 리마인드를 보낸다 —
      // 반대면 오늘 취소·종료될 모임에도 "내일" 알림이 나간다.
      const handled = clubService.expireInvites(now)
      const closed = clubService.closeVotes(now)
      const finished = clubService.finishPast(now)
      const reminded = clubService.remindExpiringInvites(now)
      const remindedTomorrow = clubService.remindTomorrow(now)
      console.log(`[club:deadlines] 초대 만료 ${handled} · 투표 마감 ${closed} · 종료 ${finished} · 마감 임박 알림 ${reminded}명 · 전날 알림 ${remindedTomorrow}명`)
      return { result: { handled, closed, finished, reminded, remindedTomorrow } }
    } catch (e) {
      console.error('[club:deadlines] 실패', e)
      return { result: { handled: 0, closed: 0, finished: 0, reminded: 0, remindedTomorrow: 0 } }
    }
  },
})
