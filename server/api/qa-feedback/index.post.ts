import { qaFeedbackRepo } from '../../repositories/qaFeedbackRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const { content, path, viewport } = await readBody<{
      content?: string
      path?: string
      viewport?: string
    }>(event)

    if (!content?.trim()) throw new ApiError(400, '내용을 입력해주세요')

    const feedback = qaFeedbackRepo.insert(
      me.id,
      (path ?? '').trim() || '(알 수 없음)',
      viewport?.trim() || null,
      content.trim()
    )
    setResponseStatus(event, 201)
    return feedback
  })
)
