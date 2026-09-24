import { clubRecruitService } from '../../../services/clubRecruitService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'

/** 개설자가 모임을 접는다(모집 중에만). */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    return clubRecruitService.withdraw(requireIdParam(event, '모임 번호'), me.id)
  })
)
