import { guestRepo } from '../../../repositories/guestRepo'
import { handleApi } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/** 게스트 선점. 동시에 눌러도 PK 충돌로 한 명만 성공하고, 나머지는 409. 로그인 관문이라 인증 없음. */
export default defineEventHandler(
  handleApi(async (event) => {
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isFinite(id)) throw new ApiError(400, '잘못된 게스트예요')
    const claim = guestRepo.claim(id)
    if (!claim) throw new ApiError(409, '방금 다른 분이 선택했어요. 다른 게스트를 골라 주세요')
    return claim
  })
)
