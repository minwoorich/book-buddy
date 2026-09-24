import { clubPostService } from '../../../../services/clubPostService'
import { handleApi, requireUser, requireIdParam } from '../../../../utils/api'

/** 모임 게시판 — 참가자만. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    return clubPostService.list(requireIdParam(event, '모임 번호'), me.id)
  })
)
