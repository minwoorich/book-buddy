import { postRepo } from '../../../repositories/postRepo'
import { uploadService } from '../../../services/uploadService'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 게시물 삭제(QA #59). 본인 또는 관리자만. 사진 파일까지 함께 지운다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    const post = postRepo.findById(id)
    if (!post) throw new ApiError(404, '없는 게시물이에요')
    if (post.userId !== me.id && me.role !== 'admin') {
      throw new ApiError(403, '내가 올린 게시물만 삭제할 수 있어요')
    }

    const removedPaths = postRepo.remove(id)
    removedPaths.forEach((path) => uploadService.remove(path))

    setResponseStatus(event, 204)
    return null
  })
)
