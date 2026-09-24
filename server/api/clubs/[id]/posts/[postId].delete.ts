import { clubPostService } from '../../../../services/clubPostService'
import { handleApi, requireUser, requireIdParam } from '../../../../utils/api'

/** 글 삭제 — 작성자 또는 개설자. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const postId = requireIdParam(event, '글 번호', 'postId')
    clubPostService.remove(id, me.id, postId)
    return { ok: true }
  })
)
