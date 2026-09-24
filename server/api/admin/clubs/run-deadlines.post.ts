import { runAllDeadlines } from '../../../services/clubDeadlines'
import { handleApi, requireAdmin } from '../../../utils/api'

/**
 * 기한 작업 수동 실행. 주기 작업(club:deadlines)이 놓쳤을 때 지금 바로 돌린다 —
 * 운영 점검과 시연에 필요하다.
 */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const config = useRuntimeConfig()
    return runAllDeadlines(new Date(), { anthropicApiKey: config.anthropicApiKey })
  })
)
