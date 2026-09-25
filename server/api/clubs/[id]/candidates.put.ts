import { clubRecruitService } from '../../../services/clubRecruitService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'

/** 후보 시간 편집 — 개설자, 모집 중. 검증은 서비스(normalizeSlots)가 한다. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ slots?: unknown }>(event)
    return clubRecruitService.setCandidates(id, me.id, body?.slots ?? [])
  })
)
