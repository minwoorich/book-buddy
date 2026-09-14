import { qaFeedbackRepo } from '../../repositories/qaFeedbackRepo'
import { uploadService } from '../../services/uploadService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { QaCategory, QaSeverity } from '../../../shared/types'

const MAX_IMAGES = 3
const CATEGORIES: QaCategory[] = ['bug', 'ui', 'idea', 'question']
const SEVERITIES: QaSeverity[] = ['blocker', 'inconvenient', 'minor']

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)

    // 스크린샷 첨부 때문에 multipart로 받는다(커뮤니티 글쓰기와 같은 방식).
    const parts = await readMultipartFormData(event)
    if (!parts) throw new ApiError(400, '내용을 입력해주세요')

    const fields: Record<string, string> = {}
    const images: { data: Buffer; filename?: string; type?: string }[] = []
    for (const part of parts) {
      if (part.name === 'image' && part.data.length > 0) {
        images.push(part)
      } else if (part.name) {
        fields[part.name] = part.data.toString('utf-8').trim()
      }
    }

    const content = fields.content ?? ''
    if (!content) throw new ApiError(400, '한 줄 요약을 입력해주세요')
    if (images.length > MAX_IMAGES) throw new ApiError(400, `스크린샷은 최대 ${MAX_IMAGES}장까지 올릴 수 있어요`)

    const category = CATEGORIES.includes(fields.category as QaCategory) ? (fields.category as QaCategory) : 'bug'
    const severity = SEVERITIES.includes(fields.severity as QaSeverity) ? (fields.severity as QaSeverity) : 'minor'

    const savedPaths = images.map((image) => uploadService.save(image))
    const feedback = qaFeedbackRepo.insert(me.id, {
      path: fields.path || '(알 수 없음)',
      viewport: fields.viewport || null,
      content,
      category,
      severity,
      detail: fields.detail || null,
      images: savedPaths,
    })
    setResponseStatus(event, 201)
    return feedback
  })
)
