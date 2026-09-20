import { CLUB_RULES, CLUB_SCORE_WEIGHTS, CLUB_DESCRIBE_THRESHOLDS } from './clubRules'

/** 매칭 후보 한 사람. DB를 모르는 순수 입력 — 레포지토리가 이 모양으로 만들어 넘긴다. */
export interface CandidateReader {
  userId: number
  userName?: string
  department: string
  /** 완독(반납) 시각 ISO. */
  returnedAt: string
  /** 이 책에 남긴 별점. 리뷰가 없으면 null. */
  rating: number | null
  /** 가장 최근에 참여한 모임의 시각 ISO. 이력이 없으면 null. */
  lastClubAt: string | null
}

export interface ClubScoreBreakdown {
  ratingSpread: number
  concurrency: number
  reviewDensity: number
  deptDiversity: number
  newcomerBonus: number
  total: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * 별점 분산. 리뷰가 2건 미만이면 0 — 이견이 있는지 알 수 없는 것과 없는 것은 다르므로
 * 추정하지 않는다. 1~5점의 실질 최대 표준편차를 2.0으로 보고 정규화한다.
 */
function ratingSpreadOf(readers: CandidateReader[]): number {
  const ratings = readers.map((r) => r.rating).filter((r): r is number => typeof r === 'number')
  if (ratings.length < 2) return 0
  return clamp01(stdev(ratings) / 2)
}

/**
 * 독서 동시성. 완독 시각들이 서로 가까울수록 1에 가깝다. 표준편차 30일이면 0.
 * (60일 창 안의 후보이므로 30일이면 사실상 "따로 읽었다"로 본다.)
 */
function concurrencyOf(readers: CandidateReader[]): number {
  if (readers.length < 2) return readers.length === 1 ? 1 : 0
  const days = readers.map((r) => new Date(r.returnedAt).getTime() / DAY_MS)
  return clamp01(1 - stdev(days) / 30)
}

function isNewcomer(reader: CandidateReader, now: Date): boolean {
  if (!reader.lastClubAt) return true
  const elapsedDays = (now.getTime() - new Date(reader.lastClubAt).getTime()) / DAY_MS
  return elapsedDays > CLUB_RULES.newcomerWindowDays
}

/** 후보 조합의 점수. 각 항목 0~1, total은 가중합이라 역시 0~1. */
export function scoreCandidate(readers: CandidateReader[], now: Date): ClubScoreBreakdown {
  if (readers.length === 0) {
    return { ratingSpread: 0, concurrency: 0, reviewDensity: 0, deptDiversity: 0, newcomerBonus: 0, total: 0 }
  }

  const ratingSpread = ratingSpreadOf(readers)
  const concurrency = concurrencyOf(readers)
  const reviewDensity = readers.filter((r) => typeof r.rating === 'number').length / readers.length
  const deptDiversity = new Set(readers.map((r) => r.department)).size / readers.length
  const newcomerBonus = readers.filter((r) => isNewcomer(r, now)).length / readers.length

  const total =
    ratingSpread * CLUB_SCORE_WEIGHTS.ratingSpread +
    concurrency * CLUB_SCORE_WEIGHTS.concurrency +
    reviewDensity * CLUB_SCORE_WEIGHTS.reviewDensity +
    deptDiversity * CLUB_SCORE_WEIGHTS.deptDiversity +
    newcomerBonus * CLUB_SCORE_WEIGHTS.newcomerBonus

  return { ratingSpread, concurrency, reviewDensity, deptDiversity, newcomerBonus, total }
}

/**
 * "왜 이 조합인지"를 관리자 승인 화면에 보여줄 한국어 한 문장으로 만든다.
 * 점수만 보여주면 승인 판단이 안 되므로 근거를 말로 옮긴다.
 */
export function describeMatch(readers: CandidateReader[], breakdown: ClubScoreBreakdown): string {
  const parts: string[] = [`${readers.length}명이 최근 같은 책을 완독했어요`]

  if (breakdown.ratingSpread > CLUB_DESCRIBE_THRESHOLDS.notableRatingSpread) {
    const ratings = readers.map((r) => r.rating).filter((r): r is number => typeof r === 'number')
    parts.push(`별점이 ${Math.min(...ratings)}점에서 ${Math.max(...ratings)}점까지 갈려 토론할 거리가 있어요`)
  } else if (breakdown.reviewDensity > 0) {
    parts.push('별점은 비슷하지만 리뷰가 남아 있어요')
  }

  const deptCount = new Set(readers.map((r) => r.department)).size
  parts.push(deptCount > 1 ? `부서가 ${deptCount}곳 섞여 있어요` : '같은 부서 구성이에요')

  if (breakdown.newcomerBonus >= CLUB_DESCRIBE_THRESHOLDS.mostlyNewcomers) parts.push('대부분 모임 참여가 처음이에요')

  return parts.join(' · ')
}
