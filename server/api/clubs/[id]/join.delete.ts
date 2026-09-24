import { clubRecruitService } from '../../../services/clubRecruitService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'

/** 참여 취소(모집 중에만). */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    return clubRecruitService.leave(requireIdParam(event, '모임 번호'), me.id)
  })
)
