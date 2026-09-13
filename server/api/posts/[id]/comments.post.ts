import { postRepo } from '../../../repositories/postRepo'
import { postCommentRepo } from '../../../repositories/postCommentRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const postId = Number(getRouterParam(event, 'id'))
    if (!postRepo.findById(postId)) throw new ApiError(404, '없는 게시물이에요')

    const { content } = await readBody<{ content?: string }>(event)
    if (!content?.trim()) throw new ApiError(400, '댓글 내용을 입력해주세요')

    const comment = postCommentRepo.insert(postId, me.id, content.trim())
    setResponseStatus(event, 201)
    return comment
  })
)
