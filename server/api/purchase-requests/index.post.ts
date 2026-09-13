import { purchaseRequestRepo } from '../../repositories/purchaseRequestRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const { title, author, isbn13, coverUrl, reason } = await readBody<{
      title: string
      author?: string
      isbn13?: string
      coverUrl?: string
      reason?: string
    }>(event)
    if (!title?.trim()) throw new ApiError(400, '제목은 필수예요')

    const request = purchaseRequestRepo.insert(me.id, {
      title: title.trim(),
      author,
      isbn13,
      coverUrl,
      reason,
    })
    setResponseStatus(event, 201)
    return request
  })
)
