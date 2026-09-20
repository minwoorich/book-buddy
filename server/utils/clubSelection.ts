import { CLUB_RULES } from './clubRules'
import type { CandidateReader } from './clubMatch'

/**
 * 쿼터 판정에 필요한 현재 상태. 레포지토리가 채워서 넘긴다 —
 * 이 모듈은 DB를 모르고, 그래서 테스트가 쉽다.
 */
export interface QuotaState {
  /** 지금 진행 중(proposed~confirmed) 모임에 속한 사람. 동시 1개 원칙. */
  busyUserIds: Set<number>
  /** 최근 personCooldownWeeks 안에 모임이 끝난 사람. */
  cooledUserIds: Set<number>
  /** 최근 bookCooldownMonths 안에 모임이 열린 책. */
  recentBookIds: Set<number>
}

function hasReview(r: CandidateReader): boolean {
  return typeof r.rating === 'number'
}

/**
 * 정원 초과 시 5명을 고른다. 우선순위는 리뷰 > 미참여 > userId(결정적 정렬)이고,
 * 그 순서를 지키면서 부서가 겹치지 않는 사람을 먼저 채워 다양성을 확보한다.
 */
export function selectMembers(readers: CandidateReader[], now: Date): CandidateReader[] {
  if (readers.length <= CLUB_RULES.maxMembers) return [...readers]

  const newcomerCutoff = now.getTime() - CLUB_RULES.newcomerWindowDays * 24 * 60 * 60 * 1000
  const isNewcomer = (r: CandidateReader) => !r.lastClubAt || new Date(r.lastClubAt).getTime() < newcomerCutoff

  const pool = [...readers].sort((a, b) => {
    if (hasReview(a) !== hasReview(b)) return hasReview(a) ? -1 : 1
    if (isNewcomer(a) !== isNewcomer(b)) return isNewcomer(a) ? -1 : 1
    return a.userId - b.userId
  })

  const picked: CandidateReader[] = []
  const seenDepts = new Set<string>()

  // 1차: 새 부서를 데려오는 사람만 — 우선순위 순서는 그대로 유지된다.
  for (const r of pool) {
    if (picked.length >= CLUB_RULES.maxMembers) break
    if (seenDepts.has(r.department)) continue
    picked.push(r)
    seenDepts.add(r.department)
  }
  // 2차: 남은 자리를 우선순위대로 채운다.
  for (const r of pool) {
    if (picked.length >= CLUB_RULES.maxMembers) break
    if (picked.includes(r)) continue
    picked.push(r)
  }

  return picked.sort((a, b) => a.userId - b.userId)
}

/**
 * 호스트 선정 — 리뷰를 쓴 사람 중 모임 이력이 가장 최근인 사람(=경험이 많은 사람),
 * 리뷰를 쓴 사람이 없으면 가장 먼저 완독한 사람.
 */
export function pickHost(members: CandidateReader[]): CandidateReader | undefined {
  if (members.length === 0) return undefined

  const reviewers = members.filter(hasReview)
  if (reviewers.length > 0) {
    return [...reviewers].sort((a, b) => {
      const at = a.lastClubAt ? new Date(a.lastClubAt).getTime() : 0
      const bt = b.lastClubAt ? new Date(b.lastClubAt).getTime() : 0
      if (at !== bt) return bt - at
      return a.userId - b.userId
    })[0]
  }

  return [...members].sort((a, b) => {
    const diff = new Date(a.returnedAt).getTime() - new Date(b.returnedAt).getTime()
    return diff !== 0 ? diff : a.userId - b.userId
  })[0]
}

/**
 * 쿼터 통과 여부. 바쁜 사람·쿨다운 중인 사람을 뺀 뒤에도 최소 정원이 남아야 하고,
 * 그 책으로 최근에 모임이 열리지 않았어야 한다.
 */
export function passesQuota(bookId: number, readers: CandidateReader[], state: QuotaState): boolean {
  if (state.recentBookIds.has(bookId)) return false
  const eligible = readers.filter((r) => !state.busyUserIds.has(r.userId) && !state.cooledUserIds.has(r.userId))
  return eligible.length >= CLUB_RULES.minMembers
}

/** 쿼터에 걸리는 사람을 제거한 후보 목록. passesQuota가 true일 때 쓴다. */
export function filterEligible(readers: CandidateReader[], state: QuotaState): CandidateReader[] {
  return readers.filter((r) => !state.busyUserIds.has(r.userId) && !state.cooledUserIds.has(r.userId))
}
