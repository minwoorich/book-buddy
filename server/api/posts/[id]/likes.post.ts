import { postRepo } from '../../../repositories/postRepo'
import { postLikeRepo } from '../../../repositories/postLikeRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const postId = Number(getRouterParam(event, 'id'))
    if (!postRepo.findById(postId)) throw new ApiError(404, '없는 게시물이에요')
    postLikeRepo.insert(postId, me.id)
    return { ok: true }
  })
)
