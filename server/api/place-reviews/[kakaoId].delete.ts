import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import { parseKakaoPlaceId } from '../../utils/placeReview'

/** 내 장소 후기 삭제. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const kakaoPlaceId = parseKakaoPlaceId(getRouterParam(event, 'kakaoId'))
    if (!placeReviewRepo.remove(kakaoPlaceId, me.id)) throw new ApiError(404, '남긴 후기가 없어요')
    setResponseStatus(event, 204)
    return null
  })
)
