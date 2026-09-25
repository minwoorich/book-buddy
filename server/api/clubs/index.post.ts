import { clubRecruitService } from '../../services/clubRecruitService'
import type { ClubPlaceInput } from '../../services/clubService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

/** 장소는 있으면 모양만 맞추고 값 검증은 서비스에 맡긴다. */
function readPlace(raw: unknown): ClubPlaceInput | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  return {
    kakaoId: typeof p.kakaoId === 'string' ? p.kakaoId : '',
    name: typeof p.name === 'string' ? p.name : '',
    lat: Number(p.lat),
    lng: Number(p.lng),
  }
}

/** 모임 직접 개설. 검증은 서비스가 한다 — 여기서는 타입만 맞춘다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const body = await readBody<{ bookId?: unknown; title?: unknown; description?: unknown; capacity?: unknown; recruitDays?: unknown; candidateSlots?: unknown; place?: unknown }>(event)
    const bookId = Number(body?.bookId)
    if (!Number.isInteger(bookId) || bookId <= 0) throw new ApiError(400, '책을 골라주세요')
    return clubRecruitService.create(me.id, {
      bookId,
      title: typeof body?.title === 'string' ? body.title : '',
      description: typeof body?.description === 'string' ? body.description : '',
      capacity: Number(body?.capacity),
      recruitDays: Number(body?.recruitDays),
      candidateSlots: body?.candidateSlots,
      place: readPlace(body?.place),
    })
  })
)
