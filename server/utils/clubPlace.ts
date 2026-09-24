import type { PlaceTagCode } from '../../shared/constants/placeTags'
import { CLUB_PLACE_LARGE_PARTY, CLUB_PLACE_REVIEW_SATURATION, CLUB_PLACE_WEIGHTS, CLUB_RULES } from './clubRules'

export interface PlaceScoreInput {
  /** 참가자 중간 지점에서의 거리(m). 좌표 없는 장소는 undefined. */
  distanceM: number | undefined
  /** 사내 후기 수. */
  total: number
  tagCounts: Partial<Record<PlaceTagCode, number>>
  /** 수락자 수 — 4명 이상이면 넓은 자리 가중치를 올린다. */
  memberCount: number
}

export interface PlaceScoreBreakdown {
  proximity: number
  spacious: number
  longStay: number
  reviews: number
  quietness: number
  total: number
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

function ratio(input: PlaceScoreInput, tag: PlaceTagCode): number {
  if (input.total === 0) return 0
  return clamp01((input.tagCounts[tag] ?? 0) / input.total)
}

/** 모임 장소 점수(스펙 §5.3). 각 항목 0~1, total은 가중합. */
export function scoreMeetingPlace(input: PlaceScoreInput): PlaceScoreBreakdown {
  const proximity =
    input.distanceM === undefined ? 0 : clamp01(1 - input.distanceM / CLUB_RULES.placeSearchRadiusM)
  const spacious = ratio(input, 'spacious')
  const longStay = ratio(input, 'long-stay')
  const reviews = clamp01(Math.log1p(input.total) / Math.log1p(CLUB_PLACE_REVIEW_SATURATION))
  // 시끄럽다는 후기가 과반이면 모임 장소로는 실격. 후기가 없으면 "시끄럽다는 증거 없음"으로 1.
  const noisyRatio = ratio(input, 'noisy')
  const quietness = input.total === 0 ? 1 : noisyRatio > 0.5 ? 0 : clamp01(1 - noisyRatio)

  const spaciousWeight =
    input.memberCount >= CLUB_PLACE_LARGE_PARTY ? CLUB_PLACE_WEIGHTS.spaciousLarge : CLUB_PLACE_WEIGHTS.spacious
  const total =
    proximity * CLUB_PLACE_WEIGHTS.proximity +
    spacious * spaciousWeight +
    longStay * CLUB_PLACE_WEIGHTS.longStay +
    reviews * CLUB_PLACE_WEIGHTS.reviews +
    quietness * CLUB_PLACE_WEIGHTS.quietness

  return { proximity, spacious, longStay, reviews, quietness, total }
}

function meters(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

/** 후보 카드의 한 줄 근거 — 왜 이 곳인지 숫자로 말한다. */
export function describeMeetingPlace(input: PlaceScoreInput): string {
  const parts: string[] = []
  if (input.distanceM !== undefined) parts.push(`중간 지점에서 ${meters(input.distanceM)}`)
  if (input.total === 0) {
    parts.push('아직 후기가 없어요')
    return parts.join(' · ')
  }
  const spacious = input.tagCounts.spacious ?? 0
  const longStay = input.tagCounts['long-stay'] ?? 0
  const noisy = input.tagCounts.noisy ?? 0
  if (spacious > 0) parts.push(`자리 넓어요 ${spacious}`)
  if (longStay > 0) parts.push(`오래 있기 좋아요 ${longStay}`)
  if (noisy > 0) parts.push(`시끄러워요 ${noisy}`)
  parts.push(`후기 ${input.total}개`)
  return parts.join(' · ')
}
