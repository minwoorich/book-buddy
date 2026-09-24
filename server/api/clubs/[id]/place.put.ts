import { clubService } from '../../../services/clubService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 장소 확정 — 실제 예약이 아니라 내부 일정용 확정(스펙 §2). 권한·잠금 판정은 서비스가 한다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ kakaoId?: unknown; name?: unknown; lat?: unknown; lng?: unknown }>(event)
    if (typeof body?.kakaoId !== 'string' || typeof body?.name !== 'string') throw new ApiError(400, '장소 정보가 필요해요')
    const lat = Number(body.lat)
    const lng = Number(body.lng)
    return clubService.setPlace(id, me.id, { kakaoId: body.kakaoId, name: body.name, lat, lng })
  })
)
