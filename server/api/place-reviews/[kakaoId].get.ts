import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import { parseKakaoPlaceId } from '../../utils/placeReview'
import type { PlaceReviewDetail } from '../../../shared/types'

/** 후기 시트용 — 한 장소의 후기 전체(사진 포함). 탭 전환은 클라이언트가 이 응답만으로 처리한다. */
export default defineEventHandler(
  handleApi((event): PlaceReviewDetail => {
    const me = requireUser(event)
    const kakaoPlaceId = parseKakaoPlaceId(getRouterParam(event, 'kakaoId'))
    return placeReviewRepo.detailByPlace(kakaoPlaceId, me.id)
  })
)
