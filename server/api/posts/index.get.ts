import { parseTagQuery } from '../../../shared/utils/hashtags'
import { postRepo } from '../../repositories/postRepo'
import { handleApi, optionalUser } from '../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = optionalUser(event)
    // ?mine=1 — 내가 올린 게시물만 최신순(QA #60).
    // ?tag=독서&tag=옥상 — 그중 하나라도 달린 게시물만(OR). 태그 하나짜리 옛 링크도 그대로 동작한다.
    const { mine, tag } = getQuery(event)
    return postRepo.listAll(me?.id, {
      mine: mine === '1' || mine === 'true',
      tags: parseTagQuery(tag),
    })
  })
)
