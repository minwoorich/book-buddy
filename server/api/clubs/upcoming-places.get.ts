import { clubRepo } from '../../repositories/clubRepo'
import { handleApi, requireUser } from '../../utils/api'

/** 곧 열리는 모임이 확정한 장소 — 장소 카드의 "모임 예정" 배지. 모임 멤버가 아니어도 본다. */
export default defineEventHandler(
  handleApi((event) => {
    requireUser(event)
    return clubRepo.upcomingPlaces(new Date().toISOString())
  })
)
