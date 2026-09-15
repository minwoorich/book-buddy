import { postRepo } from '../../repositories/postRepo'
import { handleApi, optionalUser } from '../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = optionalUser(event)
    // ?mine=1 — 내가 올린 게시물만 최신순(QA #60). ?tag=독서 — 그 해시태그 게시물만.
    const { mine, tag } = getQuery(event)
    const tagFilter = typeof tag === 'string' ? tag.trim().replace(/^#+/, '') : ''
    return postRepo.listAll(me?.id, {
      mine: mine === '1' || mine === 'true',
      tag: tagFilter || undefined,
    })
  })
)
