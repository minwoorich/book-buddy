import { clubService } from '../../../services/clubService'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'

/** 모임 장소 후보 — 참가자 중간 지점 기준, 모임 전용 점수식 정렬. 멤버만. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const { kakaoRestKey } = useRuntimeConfig(event)
    return clubService.placeCandidates(id, me.id, { kakaoRestKey })
  })
)
