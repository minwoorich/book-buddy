import { runMatcher } from '../../../services/clubMatcher'
import { handleApi, requireAdmin } from '../../../utils/api'

/**
 * 매처 수동 실행. 주 1회 주기 작업을 기다리지 않고 지금 돌린다 —
 * 테스트와 운영 점검에 필요하다.
 */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const config = useRuntimeConfig()
    return runMatcher({ anthropicApiKey: config.anthropicApiKey }, new Date())
  })
)
