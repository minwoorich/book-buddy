import { runAllDeadlines } from '../../services/clubDeadlines'

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
  async run() {
    try {
      const { anthropicApiKey } = useRuntimeConfig()
      const { recruitExpired, handled, closed, finished, reminded, remindedTomorrow, reviewRequested } = await runAllDeadlines(new Date(), { anthropicApiKey })
      console.log(`[club:deadlines] 모집 만료 ${recruitExpired} · 초대 만료 ${handled} · 투표 마감 ${closed} · 종료 ${finished} · 마감 임박 알림 ${reminded}명 · 전날 알림 ${remindedTomorrow}명 · 후기 요청 ${reviewRequested}명`)
      return { result: { recruitExpired, handled, closed, finished, reminded, remindedTomorrow, reviewRequested } }
    } catch (e) {
      console.error('[club:deadlines] 실패', e)
      return { result: { recruitExpired: 0, handled: 0, closed: 0, finished: 0, reminded: 0, remindedTomorrow: 0, reviewRequested: 0 } }
    }
  },
})
