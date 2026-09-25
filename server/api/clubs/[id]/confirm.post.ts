import { clubRecruitService } from '../../../services/clubRecruitService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'

/** 시간 확정(사전 마감) — 개설자. slot이 없으면 최다 득표. 아젠다 생성이 있어 비동기. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const body = await readBody<{ slot?: unknown }>(event)
    const config = useRuntimeConfig(event)
    return clubRecruitService.confirm(id, me.id, { anthropicApiKey: config.anthropicApiKey }, { slot: typeof body?.slot === 'string' ? body.slot : undefined })
  })
)
