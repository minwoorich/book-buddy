import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { uploadService } from '../../services/uploadService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import { parseKakaoPlaceId } from '../../utils/placeReview'

/** 내 장소 후기 삭제. 후기에 달려 있던 사진 파일도 같이 정리한다. */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const kakaoPlaceId = parseKakaoPlaceId(getRouterParam(event, 'kakaoId'))
    const removedImages = placeReviewRepo.removeMine(kakaoPlaceId, me.id)
    if (removedImages === null) throw new ApiError(404, '남긴 후기가 없어요')
    for (const path of removedImages) uploadService.remove(path)
    setResponseStatus(event, 204)
    return null
  })
)
