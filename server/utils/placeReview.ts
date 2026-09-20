import { ApiError } from './errors'
import { isPlaceTagCode, type PlaceTagCode } from '../../shared/constants/placeTags'

const PLACE_NAME_MAX = 100
const COMMENT_MAX = 80
const KAKAO_ID_RE = /^\d{1,20}$/
/** 후기 1건에 붙일 수 있는 사진 수 — QA 피드백과 같은 3장. */
export const PLACE_REVIEW_IMAGE_MAX = 3
/** uploadService가 돌려주는 공개 경로 형태만 허용한다(경로 탈출·외부 URL 차단). */
const UPLOAD_PATH_RE = /^\/api\/uploads\/[a-z0-9-]+\.(jpg|jpeg|png|webp|gif)$/i

export interface PlaceReviewInput {
  placeName: string
  tags: PlaceTagCode[]
  comment: string
  /** 첨부 사진 경로. 생략하면 사진 없음. */
  images?: string[]
}

/** 장소 후기 작성·수정 본문 검증. 태그는 1개 이상(중복 제거), 한 줄 코멘트는 선택(80자). */
export function parsePlaceReviewInput(body: unknown): PlaceReviewInput {
  const b = (body ?? {}) as { placeName?: unknown; tags?: unknown; comment?: unknown; images?: unknown }
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

  const images = parseImagePaths(b.images)

  return { placeName, tags, comment, images }
}

/**
 * 사진 경로 목록 검증 — uploadService가 만든 `/api/uploads/<name>` 형태만, 중복 없이 최대 3장.
 * 수정 때 "남길 기존 사진"을 클라이언트가 그대로 돌려보내므로 서버에서 형태를 다시 확인한다.
 */
export function parseImagePaths(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new ApiError(400, '사진 목록이 올바르지 않아요')
  const images: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string' || !UPLOAD_PATH_RE.test(value)) {
      throw new ApiError(400, '사진 경로가 올바르지 않아요')
    }
    if (!images.includes(value)) images.push(value)
  }
  if (images.length > PLACE_REVIEW_IMAGE_MAX) {
    throw new ApiError(400, `사진은 최대 ${PLACE_REVIEW_IMAGE_MAX}장까지 올릴 수 있어요`)
  }
  return images
}

/** multipart의 `keepImages` 필드(JSON 배열 문자열)를 경로 목록으로. 비어 있으면 빈 배열. */
export function parseKeepImagesField(raw: string | undefined): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError(400, '사진 목록이 올바르지 않아요')
  }
  return parseImagePaths(parsed)
}

/** 라우트 파라미터의 카카오 장소 id — 숫자 문자열만 허용. */
export function parseKakaoPlaceId(raw: unknown): string {
  if (typeof raw !== 'string' || !KAKAO_ID_RE.test(raw)) throw new ApiError(400, '잘못된 장소 id예요')
  return raw
}
