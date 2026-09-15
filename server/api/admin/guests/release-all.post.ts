import { guestRepo } from '../../../repositories/guestRepo'
import { handleApi, requireAdmin } from '../../../utils/api'

/** 관리자 일괄 해제 — 모든 게스트 토큰이 무효가 돼 접속 중인 게스트는 다음 요청에서 로그아웃된다. */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    guestRepo.releaseAll()
    return { ok: true }
  })
)
