import { clubRecruitService } from '../../../services/clubRecruitService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'

/** 공개 참여(선착순). */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    return clubRecruitService.join(requireIdParam(event, '모임 번호'), me.id)
  })
)
