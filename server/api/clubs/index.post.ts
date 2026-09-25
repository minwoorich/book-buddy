import { clubRecruitService } from '../../services/clubRecruitService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

/** 모임 직접 개설. 검증은 서비스가 한다 — 여기서는 타입만 맞춘다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const body = await readBody<{ bookId?: unknown; title?: unknown; description?: unknown; capacity?: unknown; recruitDays?: unknown; candidateSlots?: unknown }>(event)
    const bookId = Number(body?.bookId)
    if (!Number.isInteger(bookId) || bookId <= 0) throw new ApiError(400, '책을 골라주세요')
    return clubRecruitService.create(me.id, {
      bookId,
      title: typeof body?.title === 'string' ? body.title : '',
      description: typeof body?.description === 'string' ? body.description : '',
      capacity: Number(body?.capacity),
      recruitDays: Number(body?.recruitDays),
      candidateSlots: body?.candidateSlots,
    })
  })
)
