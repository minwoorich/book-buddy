import { getDb } from '../db/connection'
import type {
  Club,
  ClubAgendaItem,
  ClubInviteStatus,
  ClubMember,
  ClubMemberRole,
  ClubOrigin,
  ClubStatus,
  ClubVote,
  UpcomingClubPlace,
} from '../../shared/types'
import type { CandidateReader } from '../utils/clubMatch'
import type { QuotaState } from '../utils/clubSelection'
import { CLUB_RULES } from '../utils/clubRules'
import { toDbTime, fromDbTime } from '../utils/dbTime'
import { slotEndIso } from '../utils/clubSlots'

interface ClubRow {
  id: number
  book_id: number
  book_title: string
  book_cover_url: string | null
  status: ClubStatus
  agenda: string
  match_score: number
  match_reason: string
  candidate_slots: string
  meet_at: string | null
  invite_expires_at: string | null
  vote_expires_at: string | null
  place_kakao_id: string | null
  place_name: string | null
  place_lat: number | null
  place_lng: number | null
  place_decided_at: string | null
  created_at: string
  done_at: string | null
  canceled_reason: string | null
  origin: ClubOrigin
  created_by: number | null
  title: string | null
  description: string
  capacity: number
  recruit_until: string | null
}

interface MemberRow {
  club_id: number
  user_id: number
  user_name: string
  department: string
  company: string
  role: ClubMemberRole
  invite_status: ClubInviteStatus
  responded_at: string | null
  completed: number
  reading: number
}

const SELECT_CLUB = `SELECT c.*, b.title AS book_title, b.cover_url AS book_cover_url
                     FROM clubs c JOIN books b ON b.id = c.book_id`

/** 진행 중으로 보는 상태 — 쿼터의 "동시 1개"가 걸리는 범위. */
const ACTIVE_STATUSES = ['proposed', 'inviting', 'scheduling', 'confirmed'] as const

function parseAgenda(raw: string): ClubAgendaItem[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as ClubAgendaItem[]) : []
  } catch {
    return []
  }
}

function parseSlots(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function toMember(row: MemberRow): ClubMember {
  return {
    userId: row.user_id,
    userName: row.user_name,
    department: row.department,
    company: row.company,
    role: row.role,
    inviteStatus: row.invite_status,
    respondedAt: row.responded_at,
    completed: row.completed === 1,
    reading: row.reading === 1,
  }
}

function toClub(row: ClubRow, members: ClubMember[], votes: ClubVote[]): Club {
  const hasPlace = row.place_kakao_id !== null && row.place_name !== null
  return {
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.book_title,
    bookCoverUrl: row.book_cover_url,
    status: row.status,
    agenda: parseAgenda(row.agenda),
    matchScore: row.match_score,
    matchReason: row.match_reason,
    candidateSlots: parseSlots(row.candidate_slots),
    meetAt: row.meet_at,
    inviteExpiresAt: row.invite_expires_at,
    voteExpiresAt: row.vote_expires_at,
    place: hasPlace
      ? { kakaoId: row.place_kakao_id!, name: row.place_name!, lat: row.place_lat ?? 0, lng: row.place_lng ?? 0 }
      : null,
    placeDecidedAt: row.place_decided_at,
    createdAt: row.created_at,
    doneAt: row.done_at,
    votes,
    canceledReason: row.canceled_reason,
    members,
    origin: row.origin,
    createdBy: row.created_by,
    title: row.title,
    description: row.description,
    capacity: row.capacity,
    recruitUntil: row.recruit_until,
  }
}

/** 여러 모임의 멤버를 한 번에 읽어 club_id로 묶는다(N+1 방지). */
function membersByClub(clubIds: number[]): Map<number, ClubMember[]> {
  const out = new Map<number, ClubMember[]>()
  if (clubIds.length === 0) return out

  const placeholders = clubIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT m.*, u.name AS user_name, u.department AS department, u.company AS company,
              EXISTS (SELECT 1 FROM loans l WHERE l.user_id = m.user_id AND l.book_id = c.book_id AND l.returned_at IS NOT NULL) AS completed,
              EXISTS (SELECT 1 FROM loans l WHERE l.user_id = m.user_id AND l.book_id = c.book_id AND l.returned_at IS NULL) AS reading
       FROM club_members m JOIN users u ON u.id = m.user_id JOIN clubs c ON c.id = m.club_id
       WHERE m.club_id IN (${placeholders})
       ORDER BY m.role = 'host' DESC, m.id ASC`
    )
    .all(...clubIds) as MemberRow[]

  for (const row of rows) {
    const list = out.get(row.club_id) ?? []
    list.push(toMember(row))
    out.set(row.club_id, list)
  }
  return out
}

/** 여러 모임의 투표를 한 번에 읽어 club_id로 묶는다(멤버와 같은 방식). */
function votesByClub(clubIds: number[]): Map<number, ClubVote[]> {
  const out = new Map<number, ClubVote[]>()
  if (clubIds.length === 0) return out
  const placeholders = clubIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT club_id, user_id, slot_idx FROM club_votes WHERE club_id IN (${placeholders}) ORDER BY id ASC`)
    .all(...clubIds) as { club_id: number; user_id: number; slot_idx: number }[]
  for (const r of rows) {
    const list = out.get(r.club_id) ?? []
    list.push({ userId: r.user_id, slotIdx: r.slot_idx })
    out.set(r.club_id, list)
  }
  return out
}

function hydrate(rows: ClubRow[]): Club[] {
  const ids = rows.map((r) => r.id)
  const byClub = membersByClub(ids)
  const votes = votesByClub(ids)
  return rows.map((r) => toClub(r, byClub.get(r.id) ?? [], votes.get(r.id) ?? []))
}

export interface ProposalInput {
  bookId: number
  matchScore: number
  matchReason: string
  agenda: ClubAgendaItem[]
  members: { userId: number; role: ClubMemberRole }[]
  inviteExpiresAt: string
}

export interface UserClubInput {
  bookId: number
  createdBy: number
  title: string
  description: string
  capacity: number
  /** 모집 마감(ISO). 서비스가 23:59:59Z로 정규화해서 넘긴다. */
  recruitUntilIso: string
}

export const clubRepo = {
  /** 에이전트가 만든 제안 한 건을 멤버와 함께 저장한다(둘이 따로 남으면 안 되므로 트랜잭션). */
  insertProposal(input: ProposalInput): Club {
    const db = getDb()
    const create = db.transaction(() => {
      const id = Number(
        db
          .prepare(
            `INSERT INTO clubs (book_id, status, agenda, match_score, match_reason, invite_expires_at)
             VALUES (?, 'proposed', ?, ?, ?, ?)`
          )
          .run(input.bookId, JSON.stringify(input.agenda), input.matchScore, input.matchReason, input.inviteExpiresAt)
          .lastInsertRowid
      )
      const insertMember = db.prepare(`INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)`)
      for (const m of input.members) insertMember.run(id, m.userId, m.role)
      return id
    })

    const id = create()
    return this.findById(id)!
  },

  findById(id: number): Club | undefined {
    const row = getDb().prepare(`${SELECT_CLUB} WHERE c.id = ?`).get(id) as ClubRow | undefined
    return row ? hydrate([row])[0] : undefined
  },

  listByStatus(status: ClubStatus): Club[] {
    const rows = getDb().prepare(`${SELECT_CLUB} WHERE c.status = ? ORDER BY c.id DESC`).all(status) as ClubRow[]
    return hydrate(rows)
  },

  listForUser(userId: number): Club[] {
    const rows = getDb()
      .prepare(
        `${SELECT_CLUB} WHERE c.id IN (SELECT club_id FROM club_members WHERE user_id = ?)
         ORDER BY c.id DESC`
      )
      .all(userId) as ClubRow[]
    return hydrate(rows)
  },

  updateStatus(id: number, status: ClubStatus, opts: { canceledReason?: string } = {}): void {
    getDb()
      .prepare(`UPDATE clubs SET status = ?, canceled_reason = ? WHERE id = ?`)
      .run(status, opts.canceledReason ?? null, id)
  },

  /** 모임 종료 — 상태와 종료 시각을 함께 쓴다(쿨다운 기준). */
  markDone(id: number, doneAtIso: string): void {
    getDb().prepare(`UPDATE clubs SET status = 'done', done_at = ? WHERE id = ?`).run(doneAtIso, id)
  },

  setInviteStatus(clubId: number, userId: number, status: ClubInviteStatus): void {
    getDb()
      .prepare(
        `UPDATE club_members SET invite_status = ?, responded_at = datetime('now')
         WHERE club_id = ? AND user_id = ?`
      )
      .run(status, clubId, userId)
  },

  /** 기존 호스트를 member로 내리고 지정한 사람을 host로 올린다. */
  setHost(clubId: number, userId: number): void {
    const db = getDb()
    const swap = db.transaction(() => {
      db.prepare(`UPDATE club_members SET role = 'member' WHERE club_id = ?`).run(clubId)
      db.prepare(`UPDATE club_members SET role = 'host' WHERE club_id = ? AND user_id = ?`).run(clubId, userId)
    })
    swap()
  },

  /**
   * 쿼터 판정용 현재 상태.
   * - busy: 진행 중 모임에 속한 사람
   * - cooled: 최근 personCooldownWeeks 안에 끝난(done) 모임에 속했던 사람
   * - recentBook: 최근 bookCooldownMonths 안에 만들어진 모임의 책 (취소된 건 제외 — 취소는 재시도를 막을 이유가 없다)
   */
  quotaState(now: Date): QuotaState {
    const db = getDb()
    const bookSince = toDbTime(
      new Date(now.getTime() - CLUB_RULES.bookCooldownMonths * 30 * 24 * 60 * 60 * 1000)
    )

    const activePlaceholders = ACTIVE_STATUSES.map(() => '?').join(',')
    const busy = db
      .prepare(
        `SELECT DISTINCT m.user_id AS id FROM club_members m JOIN clubs c ON c.id = m.club_id
         WHERE c.status IN (${activePlaceholders}) AND m.invite_status != 'declined'`
      )
      .all(...ACTIVE_STATUSES) as { id: number }[]

    // done_at은 앱이 ISO로 쓰는 컬럼 — ISO끼리 비교한다(created_at과 달리 toDbTime을 쓰지 않는다).
    const cooldownSinceIso = new Date(
      now.getTime() - CLUB_RULES.personCooldownWeeks * 7 * 24 * 60 * 60 * 1000
    ).toISOString()
    const cooled = db
      .prepare(
        `SELECT DISTINCT m.user_id AS id FROM club_members m JOIN clubs c ON c.id = m.club_id
         WHERE c.status = 'done' AND c.done_at IS NOT NULL AND c.done_at >= ? AND m.invite_status = 'accepted'`
      )
      .all(cooldownSinceIso) as { id: number }[]

    const books = db
      .prepare(`SELECT DISTINCT book_id AS id FROM clubs WHERE status != 'canceled' AND created_at >= ?`)
      .all(bookSince) as { id: number }[]

    return {
      busyUserIds: new Set(busy.map((r) => r.id)),
      cooledUserIds: new Set(cooled.map((r) => r.id)),
      recentBookIds: new Set(books.map((r) => r.id)),
    }
  },

  /**
   * 최근 completionWindowDays 안에 완독(반납)한 사람이 minMembers 이상인 책을 찾아
   * book_id별 후보 목록으로 준다. 게스트는 제외한다(시연 계정이 모임에 묶이면 해제 시 깨진다).
   */
  findCandidateReaders(now: Date): Map<number, CandidateReader[]> {
    // returned_at은 datetime('now') 포맷이므로 비교값도 같은 포맷이어야 한다.
    const since = toDbTime(new Date(now.getTime() - CLUB_RULES.completionWindowDays * 24 * 60 * 60 * 1000))

    const rows = getDb()
      .prepare(
        `SELECT l.book_id AS bookId, l.user_id AS userId, u.name AS userName, u.department AS department,
                MAX(l.returned_at) AS returnedAt,
                (SELECT rating FROM reviews WHERE book_id = l.book_id AND user_id = l.user_id
                  ORDER BY id DESC LIMIT 1) AS rating,
                (SELECT MAX(c.created_at) FROM club_members m JOIN clubs c ON c.id = m.club_id
                  WHERE m.user_id = l.user_id AND c.status != 'canceled') AS lastClubAt
         FROM loans l JOIN users u ON u.id = l.user_id
         WHERE l.returned_at IS NOT NULL AND l.returned_at >= ? AND u.is_guest = 0
         GROUP BY l.book_id, l.user_id`
      )
      .all(since) as (CandidateReader & { bookId: number })[]

    const byBook = new Map<number, CandidateReader[]>()
    for (const row of rows) {
      const list = byBook.get(row.bookId) ?? []
      list.push({
        userId: row.userId,
        userName: row.userName,
        department: row.department,
        returnedAt: row.returnedAt,
        rating: row.rating ?? null,
        lastClubAt: row.lastClubAt ?? null,
      })
      byBook.set(row.bookId, list)
    }

    for (const [bookId, readers] of byBook) {
      if (readers.length < CLUB_RULES.minMembers) byBook.delete(bookId)
    }
    return byBook
  },

  /** 후보 시간을 시간순으로 저장한다 — 동점·무투표 시 "가장 이른 슬롯" 규칙의 전제. */
  setCandidateSlots(id: number, slots: string[], voteExpiresAtIso: string): void {
    getDb()
      .prepare(`UPDATE clubs SET candidate_slots = ?, vote_expires_at = ? WHERE id = ?`)
      .run(JSON.stringify([...slots].sort()), voteExpiresAtIso, id)
  },

  confirm(id: number, meetAtIso: string): void {
    getDb().prepare(`UPDATE clubs SET status = 'confirmed', meet_at = ? WHERE id = ?`).run(meetAtIso, id)
  },

  /** 한 사람의 표를 통째로 다시 쓴다(체크박스 다중 선택 저장). */
  castVotes(clubId: number, userId: number, slotIdxs: number[]): void {
    const db = getDb()
    const run = db.transaction(() => {
      db.prepare(`DELETE FROM club_votes WHERE club_id = ? AND user_id = ?`).run(clubId, userId)
      const ins = db.prepare(`INSERT INTO club_votes (club_id, user_id, slot_idx) VALUES (?, ?, ?)`)
      for (const idx of [...new Set(slotIdxs)].sort((a, b) => a - b)) ins.run(clubId, userId, idx)
    })
    run()
  },

  /** 참가자들이 수락한 다른 confirmed 모임의 시간 구간 — 슬롯 생성 시 충돌 회피용. */
  busyIntervalsFor(userIds: number[], excludeClubId: number): { start: string; end: string }[] {
    if (userIds.length === 0) return []
    const placeholders = userIds.map(() => '?').join(',')
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT c.meet_at AS meetAt FROM clubs c JOIN club_members m ON m.club_id = c.id
         WHERE c.status = 'confirmed' AND c.meet_at IS NOT NULL AND c.id != ?
           AND m.invite_status = 'accepted' AND m.user_id IN (${placeholders})`
      )
      .all(excludeClubId, ...userIds) as { meetAt: string }[]
    return rows.map((r) => ({ start: r.meetAt, end: slotEndIso(r.meetAt) }))
  },

  /** 아직 반납하지 않은 그 책 대출 중 가장 이른 반납 예정일. 없으면 null. */
  earliestDueAtFor(bookId: number, userIds: number[]): string | null {
    if (userIds.length === 0) return null
    const placeholders = userIds.map(() => '?').join(',')
    const row = getDb()
      .prepare(
        `SELECT MIN(due_at) AS dueAt FROM loans
         WHERE book_id = ? AND returned_at IS NULL AND user_id IN (${placeholders})`
      )
      .get(bookId, ...userIds) as { dueAt: string | null }
    return row.dueAt ? fromDbTime(row.dueAt) : null
  },

  reviewerIdsFor(bookId: number, userIds: number[]): Set<number> {
    if (userIds.length === 0) return new Set()
    const placeholders = userIds.map(() => '?').join(',')
    const rows = getDb()
      .prepare(`SELECT DISTINCT user_id AS id FROM reviews WHERE book_id = ? AND user_id IN (${placeholders})`)
      .all(bookId, ...userIds) as { id: number }[]
    return new Set(rows.map((r) => r.id))
  },

  adminUserIds(): number[] {
    return (getDb().prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id`).all() as { id: number }[]).map((r) => r.id)
  },

  /** 장소 확정(내부 일정용 — 실제 예약이 아니다). meet_at은 건드리지 않는다. */
  setPlace(id: number, place: { kakaoId: string; name: string; lat: number; lng: number }, decidedAtIso: string): void {
    getDb()
      .prepare(
        `UPDATE clubs SET place_kakao_id = ?, place_name = ?, place_lat = ?, place_lng = ?, place_decided_at = ?
         WHERE id = ?`
      )
      .run(place.kakaoId, place.name, place.lat, place.lng, decidedAtIso, id)
  },

  /** 장소가 정해진 앞으로의 모임 — 장소 카드의 "모임 예정" 배지. meet_at은 ISO라 ISO끼리 비교. */
  upcomingPlaces(nowIso: string): UpcomingClubPlace[] {
    const rows = getDb()
      .prepare(
        `SELECT c.id AS clubId, c.place_kakao_id AS kakaoId, b.title AS bookTitle, c.meet_at AS meetAt
         FROM clubs c JOIN books b ON b.id = c.book_id
         WHERE c.status = 'confirmed' AND c.place_kakao_id IS NOT NULL AND c.meet_at > ?
         ORDER BY c.meet_at ASC`
      )
      .all(nowIso) as UpcomingClubPlace[]
    return rows
  },

  /**
   * 끝난 모임 중 장소가 있는 것 — 사후 후기 요청 대상. sinceIso를 주면 done_at >= sinceIso로
   * 스캔 범위를 줄인다(매일 역대 전체를 다시 읽지 않게). done_at은 앱이 쓰는 ISO 컬럼이라 ISO끼리 비교.
   */
  listDoneWithPlace(sinceIso?: string): Club[] {
    const rows = sinceIso
      ? (getDb()
          .prepare(`${SELECT_CLUB} WHERE c.status = 'done' AND c.place_kakao_id IS NOT NULL AND c.done_at >= ? ORDER BY c.id DESC`)
          .all(sinceIso) as ClubRow[])
      : (getDb()
          .prepare(`${SELECT_CLUB} WHERE c.status = 'done' AND c.place_kakao_id IS NOT NULL ORDER BY c.id DESC`)
          .all() as ClubRow[])
    return hydrate(rows)
  },

  /** 사람이 직접 연 모임. 만들자마자 모집 중이고 개설자는 host·accepted로 들어간다. */
  createUserClub(input: UserClubInput): Club {
    const db = getDb()
    const create = db.transaction(() => {
      const id = Number(
        db
          .prepare(
            `INSERT INTO clubs (book_id, status, origin, created_by, title, description, capacity, recruit_until)
             VALUES (?, 'inviting', 'user', ?, ?, ?, ?, ?)`
          )
          .run(input.bookId, input.createdBy, input.title, input.description, input.capacity, input.recruitUntilIso).lastInsertRowid
      )
      db.prepare(
        `INSERT INTO club_members (club_id, user_id, role, invite_status, responded_at) VALUES (?, ?, 'host', 'accepted', datetime('now'))`
      ).run(id, input.createdBy)
      return id
    })
    return this.findById(create())!
  },

  /**
   * 멤버 행을 넣거나(없으면) 응답 상태만 바꾼다(있으면). role은 첫 INSERT 때만 정해진다 —
   * 공개 참여(accepted)·초대(invited)·거절했다 다시 참여(accepted)가 전부 이 한 문장이다.
   */
  upsertMember(clubId: number, userId: number, role: ClubMemberRole, inviteStatus: ClubInviteStatus): void {
    getDb()
      .prepare(
        `INSERT INTO club_members (club_id, user_id, role, invite_status, responded_at)
         VALUES (?, ?, ?, ?, CASE WHEN ? = 'invited' THEN NULL ELSE datetime('now') END)
         ON CONFLICT(club_id, user_id) DO UPDATE SET
           invite_status = excluded.invite_status,
           responded_at = excluded.responded_at`
      )
      .run(clubId, userId, role, inviteStatus, inviteStatus)
  },

  removeMember(clubId: number, userId: number): void {
    getDb().prepare(`DELETE FROM club_members WHERE club_id = ? AND user_id = ?`).run(clubId, userId)
  },

  /** 모집을 닫을 때 아직 응답 없는 초대를 거절로 정리한다. 바뀐 행 수. */
  declinePending(clubId: number): number {
    return getDb()
      .prepare(`UPDATE club_members SET invite_status = 'declined', responded_at = datetime('now') WHERE club_id = ? AND invite_status = 'invited'`)
      .run(clubId).changes
  },

  /** 모집 중인 사람 모임 — 목록의 "모집 중" 구획. recruit_until은 ISO라 ISO끼리 비교. */
  listRecruiting(nowIso: string): Club[] {
    const rows = getDb()
      .prepare(`${SELECT_CLUB} WHERE c.origin = 'user' AND c.status = 'inviting' AND c.recruit_until > ? ORDER BY c.recruit_until ASC, c.id ASC`)
      .all(nowIso) as ClubRow[]
    return hydrate(rows)
  },

  /** 개설 상한 판정 — 이 사람이 호스트로 모집 중인 사람 모임 수. */
  hostingRecruitingCount(userId: number): number {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM clubs c JOIN club_members m ON m.club_id = c.id
         WHERE c.origin = 'user' AND c.status = 'inviting' AND m.user_id = ? AND m.role = 'host'`
      )
      .get(userId) as { n: number }
    return row.n
  },

  setAgenda(id: number, agenda: ClubAgendaItem[]): void {
    getDb().prepare(`UPDATE clubs SET agenda = ? WHERE id = ?`).run(JSON.stringify(agenda), id)
  },

  /** 아젠다 생성 입력 — 지정한 사람들이 그 책에 남긴 리뷰 원문. 매처와 모집 마감이 같이 쓴다. */
  agendaReviewsFor(bookId: number, userIds: number[]): { userId: number; userName: string; rating: number; content: string }[] {
    if (userIds.length === 0) return []
    const placeholders = userIds.map(() => '?').join(',')
    return getDb()
      .prepare(
        `SELECT r.user_id AS userId, u.name AS userName, r.rating AS rating, r.content AS content
         FROM reviews r JOIN users u ON u.id = r.user_id
         WHERE r.book_id = ? AND r.user_id IN (${placeholders})
         ORDER BY r.id ASC`
      )
      .all(bookId, ...userIds) as { userId: number; userName: string; rating: number; content: string }[]
  },

  /** 관리자 화면 "진행 중인 모임" — 모집 중·조율 중·확정. */
  listActive(): Club[] {
    const rows = getDb()
      .prepare(`${SELECT_CLUB} WHERE c.status IN ('inviting','scheduling','confirmed') ORDER BY c.id DESC`)
      .all() as ClubRow[]
    return hydrate(rows)
  },
}
