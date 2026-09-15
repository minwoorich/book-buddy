import { bookRepo } from '../../../repositories/bookRepo'
import { postRepo } from '../../../repositories/postRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 게시물 캡션·책 태그 수정(QA #59). 본인만 가능하다. 사진 교체는 지원하지 않는다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    const post = postRepo.findById(id)
    if (!post) throw new ApiError(404, '없는 게시물이에요')
    if (post.userId !== me.id) throw new ApiError(403, '내가 올린 게시물만 수정할 수 있어요')

    const body = await readBody<{ caption?: string | null; bookId?: number | null }>(event)
    const caption =
      body.caption === undefined ? post.caption : (String(body.caption ?? '').trim() || null)

    let bookId = post.bookId
    if (body.bookId !== undefined) {
      if (body.bookId === null) {
        bookId = null
      } else {
        const parsed = Number(body.bookId)
        if (!Number.isFinite(parsed) || !bookRepo.findById(parsed)) throw new ApiError(404, '없는 책이에요')
        bookId = parsed
      }
    }

    return postRepo.update(id, { caption, bookId })
  })
)
