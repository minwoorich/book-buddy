import { ApiError } from './errors'
import { isPlaceTagCode, type PlaceTagCode } from '../../shared/constants/placeTags'

const PLACE_NAME_MAX = 100
const COMMENT_MAX = 80
const KAKAO_ID_RE = /^\d{1,20}$/

export interface PlaceReviewInput {
  placeName: string
  tags: PlaceTagCode[]
  comment: string
}

/** 장소 후기 작성·수정 본문 검증. 태그는 1개 이상(중복 제거), 한 줄 코멘트는 선택(80자). */
export function parsePlaceReviewInput(body: unknown): PlaceReviewInput {
  const b = (body ?? {}) as { placeName?: unknown; tags?: unknown; comment?: unknown }
  const placeName = typeof b.placeName === 'string' ? b.placeName.trim() : ''
  if (!placeName) throw new ApiError(400, '장소 이름이 필요해요')
  if (placeName.length > PLACE_NAME_MAX) throw new ApiError(400, `장소 이름은 ${PLACE_NAME_MAX}자 이내여야 해요`)

  const rawTags = Array.isArray(b.tags) ? b.tags : []
  const tags: PlaceTagCode[] = []
  for (const t of rawTags) {
    if (!isPlaceTagCode(t)) throw new ApiError(400, '알 수 없는 태그예요')
    if (!tags.includes(t)) tags.push(t)
  }
  if (tags.length === 0) throw new ApiError(400, '태그를 하나 이상 골라주세요')

  const comment = typeof b.comment === 'string' ? b.comment.trim() : ''
  if (comment.length > COMMENT_MAX) throw new ApiError(400, `한 줄 후기는 ${COMMENT_MAX}자 이내로 적어주세요`)

  return { placeName, tags, comment }
}

/** 라우트 파라미터의 카카오 장소 id — 숫자 문자열만 허용. */
export function parseKakaoPlaceId(raw: unknown): string {
  if (typeof raw !== 'string' || !KAKAO_ID_RE.test(raw)) throw new ApiError(400, '잘못된 장소 id예요')
  return raw
}
