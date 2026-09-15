import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import { parseKakaoPlaceId, parsePlaceReviewInput } from '../../utils/placeReview'

/** 내 장소 후기 작성/수정(1인 1후기 upsert). 게스트 포함 로그인 사용자 누구나. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const kakaoPlaceId = parseKakaoPlaceId(getRouterParam(event, 'kakaoId'))
    const input = parsePlaceReviewInput(await readBody(event))
    const review = placeReviewRepo.upsert(kakaoPlaceId, me.id, input)
    setResponseStatus(event, 201)
    return review
  })
)
