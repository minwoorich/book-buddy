import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { handleApi, requireUser } from '../../utils/api'
import type { PlaceReviewSummary } from '../../../shared/types'

const IDS_MAX = 30
const KAKAO_ID_RE = /^\d{1,20}$/

/** 장소 카드 목록용 후기 요약 일괄 조회. `?ids=a,b,c` — 형식 안 맞는 id는 무시, 최대 30개. */
export default defineEventHandler(
  handleApi((event): PlaceReviewSummary[] => {
    const me = requireUser(event)
    const raw = getQuery(event).ids
    const ids = (typeof raw === 'string' ? raw.split(',') : [])
      .map((s) => s.trim())
      .filter((s) => KAKAO_ID_RE.test(s))
    const unique = [...new Set(ids)].slice(0, IDS_MAX)
    return placeReviewRepo.summaryByIds(unique, me.id)
  })
)
