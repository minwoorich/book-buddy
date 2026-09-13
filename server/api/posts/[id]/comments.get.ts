import { postCommentRepo } from '../../../repositories/postCommentRepo'
import { handleApi } from '../../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const postId = Number(getRouterParam(event, 'id'))
    return postCommentRepo.listByPost(postId)
  })
)
