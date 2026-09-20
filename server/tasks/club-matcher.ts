import { runMatcher } from '../services/clubMatcher'

/**
 * 주 1회(월 09:00 KST) 모임 후보를 찾아 제안을 만든다.
 * 실패해도 던지지 않는다 — 스케줄러가 죽으면 다음 주 실행까지 통째로 사라진다.
 */
export default defineTask({
  meta: {
    name: 'club:matcher',
    description: '책모임 후보를 찾아 관리자 승인 큐에 제안을 올린다',
  },
  async run() {
    const config = useRuntimeConfig()
    try {
      const result = await runMatcher({ anthropicApiKey: config.anthropicApiKey }, new Date())
      console.log(`[club:matcher] 제안 ${result.created}건 생성, ${result.skipped}권 제외`)
      return { result }
    } catch (e) {
      console.error('[club:matcher] 실패', e)
      return { result: { created: 0, skipped: 0, clubIds: [] } }
    }
  },
})
