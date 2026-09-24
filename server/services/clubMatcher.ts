import { getDb } from '../db/connection'
import { clubRepo } from '../repositories/clubRepo'
import { generateAgenda, type AgendaReview } from '../ai/clubAgenda'
import { describeMatch, scoreCandidate, type CandidateReader } from '../utils/clubMatch'
import { filterEligible, passesQuota, pickHost, selectMembers } from '../utils/clubSelection'
import { CLUB_RULES } from '../utils/clubRules'

export interface MatchRunResult {
  created: number
  /** 후보였지만 쿼터·정원에 걸려 버려진 책 수. 운영 로그용. */
  skipped: number
  clubIds: number[]
}

interface ScoredCandidate {
  bookId: number
  members: CandidateReader[]
  score: number
  reason: string
}

/** 아젠다 폴백 문구에 책 제목이 들어가야 하므로 제목을 따로 읽는다. */
function bookTitleOf(bookId: number): string {
  const row = getDb().prepare(`SELECT title FROM books WHERE id = ?`).get(bookId) as { title: string } | undefined
  return row?.title ?? ''
}

/**
 * 주 1회 도는 매처. 최근 완독자를 훑어 모임 후보를 만들고, 쿼터를 통과한 것 중
 * 점수 상위 N건만 제안으로 남긴다.
 *
 * 쿼터 상태(busy 등)는 실행당 한 번만 읽는다. 같은 실행 안에서 한 사람이 두 모임에
 * 묶이는 것은 DB가 아니라 usedUserIds(실행 범위 Set)로 막는다 — 제안을 만들 때마다
 * 그 멤버를 넣고, 다음 후보에서는 그들을 뺀 뒤 정원을 다시 검사한다.
 */
export async function runMatcher(deps: { anthropicApiKey: string }, now: Date): Promise<MatchRunResult> {
  const byBook = clubRepo.findCandidateReaders(now)
  const quota = clubRepo.quotaState(now)

  const scored: ScoredCandidate[] = []
  let skipped = 0

  for (const [bookId, readers] of byBook) {
    if (!passesQuota(bookId, readers, quota)) {
      skipped += 1
      continue
    }
    const members = selectMembers(filterEligible(readers, quota), now)
    if (members.length < CLUB_RULES.minMembers) {
      skipped += 1
      continue
    }
    const breakdown = scoreCandidate(members, now)
    scored.push({ bookId, members, score: breakdown.total, reason: describeMatch(members, breakdown) })
  }

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.bookId - b.bookId))

  // 매처(월 00:00 UTC)와 기한 작업(매일 00:00 UTC)이 같은 순간에 돌기 때문에, 마감을
  // "실행 시각 + 72h"로 두면 리마인드·만료가 스케줄러 지터에 따라 하루씩 밀린다.
  // 그날의 끝(23:59:59 UTC)으로 정규화해 어떤 작업 실행 순간과도 겹치지 않게 한다.
  const deadline = new Date(now.getTime() + CLUB_RULES.inviteDeadlineDays * 24 * 60 * 60 * 1000)
  deadline.setUTCHours(23, 59, 59, 0)
  const inviteExpiresAt = deadline.toISOString()

  const clubIds: number[] = []
  const usedUserIds = new Set<number>()

  for (const candidate of scored) {
    if (clubIds.length >= CLUB_RULES.proposalsPerRun) break

    // 앞선 제안에 이미 들어간 사람은 뺀다(같은 실행 안에서의 동시 1개 보장).
    const members = candidate.members.filter((m) => !usedUserIds.has(m.userId))
    if (members.length < CLUB_RULES.minMembers) {
      skipped += 1
      continue
    }

    const host = pickHost(members)
    if (!host) {
      skipped += 1
      continue
    }

    const agenda = await generateAgenda(deps, {
      bookTitle: bookTitleOf(candidate.bookId),
      reviews: clubRepo.agendaReviewsFor(candidate.bookId, members.map((m) => m.userId)) as AgendaReview[],
    })

    const club = clubRepo.insertProposal({
      bookId: candidate.bookId,
      matchScore: candidate.score,
      matchReason: candidate.reason,
      agenda,
      members: members.map((m) => ({ userId: m.userId, role: m.userId === host.userId ? 'host' : 'member' })),
      inviteExpiresAt,
    })

    clubIds.push(club.id)
    for (const m of members) usedUserIds.add(m.userId)
  }

  return { created: clubIds.length, skipped, clubIds }
}
