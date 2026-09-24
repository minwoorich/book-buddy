import { clubRecruitService } from '../../../services/clubRecruitService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'

/** 모집 마감 → 시간 잡기. 아젠다 생성이 있어 비동기. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const config = useRuntimeConfig(event)
    return clubRecruitService.closeRecruiting(requireIdParam(event, '모임 번호'), me.id, { anthropicApiKey: config.anthropicApiKey })
  })
)
