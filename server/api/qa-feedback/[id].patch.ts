import { qaFeedbackRepo } from '../../repositories/qaFeedbackRepo'
import { uploadService } from '../../services/uploadService'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { QaFeedback } from '../../../shared/types'

const STATUSES: QaFeedback['status'][] = ['open', 'resolved']

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    const { status } = await readBody<{ status?: string }>(event)

    if (!status || !STATUSES.includes(status as QaFeedback['status'])) {
      throw new ApiError(400, '지원하지 않는 상태예요')
    }
    const feedback = qaFeedbackRepo.findById(id)
    if (!feedback) throw new ApiError(404, '없는 피드백이에요')

    qaFeedbackRepo.updateStatus(id, status as QaFeedback['status'])

    // QA가 끝나면(해결 처리) 첨부 스크린샷은 파일까지 즉시 삭제한다 — 디스크를 계속
    // 차지할 이유가 없는 일회성 자료다. 되돌리기(open)로 복구해도 이미지는 돌아오지 않는다.
    if (status === 'resolved' && feedback.images.length > 0) {
      feedback.images.forEach((path) => uploadService.remove(path))
      qaFeedbackRepo.clearImages(id)
    }

    return qaFeedbackRepo.findById(id)
  })
)
