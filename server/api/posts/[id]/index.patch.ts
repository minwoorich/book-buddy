import { bookRepo } from '../../../repositories/bookRepo'
import { postRepo } from '../../../repositories/postRepo'
import { postTagRepo } from '../../../repositories/postTagRepo'
import { mergeTags, normalizeTags } from '../../../../shared/utils/hashtags'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 게시물 캡션·책 태그·해시태그 수정(QA #59). 본인만 가능하다. 사진 교체는 지원하지 않는다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    const post = postRepo.findById(id)
    if (!post) throw new ApiError(404, '없는 게시물이에요')
    if (post.userId !== me.id) throw new ApiError(403, '내가 올린 게시물만 수정할 수 있어요')

    const body = await readBody<{ caption?: string | null; bookId?: number | null; tags?: unknown }>(event)
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

    const updated = postRepo.update(id, { caption, bookId })
    // tags를 보냈으면 그걸로 교체, 안 보냈으면 기존 칩 태그를 유지 — 어느 쪽이든 캡션의 #태그는 다시 합친다.
    const explicit = Array.isArray(body.tags)
      ? normalizeTags(body.tags.filter((v): v is string => typeof v === 'string'))
      : post.tags
    const tags = mergeTags(explicit, caption)
    postTagRepo.replace(id, tags)
    return updated ? { ...updated, tags } : updated
  })
)
