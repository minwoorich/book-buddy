import { memberRepo } from '../../../repositories/memberRepo'
import { handleApi, requireUser } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/**
 * 다른 사람의 독서 프로필 — 랭킹에서 이름을 눌렀을 때 쓴다.
 * 로그인만 요구하고(관리자 아님), 완독한 책과 남긴 리뷰만 공개한다.
 */
export default defineEventHandler(
  handleApi(async (event) => {
    requireUser(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, '잘못된 회원이에요')

    const profile = memberRepo.readerProfileOf(id)
    if (!profile) throw new ApiError(404, '없는 회원이에요')
    return profile
  })
)
