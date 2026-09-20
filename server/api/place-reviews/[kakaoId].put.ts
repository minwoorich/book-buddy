import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { uploadService } from '../../services/uploadService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import {
  PLACE_REVIEW_IMAGE_MAX,
  parseKakaoPlaceId,
  parseKeepImagesField,
  parsePlaceReviewInput,
} from '../../utils/placeReview'

/**
 * 내 장소 후기 작성/수정(1인 1후기 upsert). 게스트 포함 로그인 사용자 누구나.
 *
 * 사진 첨부 때문에 multipart로 받는다(커뮤니티 글쓰기·QA 피드백과 같은 방식).
 * 수정은 "남길 기존 사진(keepImages) + 새로 올린 파일(image)"로 목록을 통째로 다시 만든다 —
 * 빠진 기존 사진은 더 참조되지 않으므로 파일까지 지운다.
 */
/** multipart의 tags 필드(JSON 배열 문자열). 깨진 값은 빈 배열로 흘려 parsePlaceReviewInput이 400을 내게 한다. */
function parseTagsField(raw: string | undefined): unknown {
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const kakaoPlaceId = parseKakaoPlaceId(getRouterParam(event, 'kakaoId'))

    const parts = await readMultipartFormData(event)
    if (!parts) throw new ApiError(400, '후기 내용이 필요해요')

    const fields: Record<string, string> = {}
    const files: { data: Buffer; filename?: string; type?: string }[] = []
    for (const part of parts) {
      if (part.name === 'image' && part.data.length > 0) files.push(part)
      else if (part.name) fields[part.name] = part.data.toString('utf-8')
    }

    // 클라이언트가 보낸 "남길 사진"은 실제로 내 후기에 달려 있던 것만 인정한다
    // (남의 사진 경로를 끼워 넣어 내 후기에 붙이는 걸 막는다).
    const before = placeReviewRepo.findMine(kakaoPlaceId, me.id)?.images ?? []
    const requested = parseKeepImagesField(fields.keepImages)
    const keep = requested.filter((path) => before.includes(path))

    if (keep.length + files.length > PLACE_REVIEW_IMAGE_MAX) {
      throw new ApiError(400, `사진은 최대 ${PLACE_REVIEW_IMAGE_MAX}장까지 올릴 수 있어요`)
    }

    // 파일을 디스크에 쓰기 전에 나머지 필드를 먼저 검증한다 — 태그가 비어 400이 나는데
    // 사진만 저장돼 주인 없는 파일이 남는 일을 막는다.
    const input = parsePlaceReviewInput({
      placeName: fields.placeName,
      tags: parseTagsField(fields.tags),
      comment: fields.comment,
      images: keep,
    })

    const added = files.map((file) => uploadService.save(file))
    const review = placeReviewRepo.upsert(kakaoPlaceId, me.id, { ...input, images: [...keep, ...added] })
    for (const path of before) {
      if (!keep.includes(path)) uploadService.remove(path)
    }

    setResponseStatus(event, 201)
    return review
  })
)
