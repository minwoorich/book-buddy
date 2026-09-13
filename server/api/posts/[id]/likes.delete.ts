import { postLikeRepo } from '../../../repositories/postLikeRepo'
import { handleApi, requireUser } from '../../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const postId = Number(getRouterParam(event, 'id'))
    postLikeRepo.remove(postId, me.id)
    setResponseStatus(event, 204)
    return null
  })
)
