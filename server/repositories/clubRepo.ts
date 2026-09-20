import { getDb } from '../db/connection'
import type { Club, ClubAgendaItem, ClubInviteStatus, ClubMember, ClubMemberRole, ClubStatus } from '../../shared/types'
import type { CandidateReader } from '../utils/clubMatch'
import type { QuotaState } from '../utils/clubSelection'
import { CLUB_RULES } from '../utils/clubRules'
import { toDbTime } from '../utils/dbTime'

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
  canceled_reason: string | null
}

interface MemberRow {
  club_id: number
  user_id: number
  user_name: string
  department: string
  role: ClubMemberRole
  invite_status: ClubInviteStatus
  responded_at: string | null
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
    role: row.role,
    inviteStatus: row.invite_status,
    respondedAt: row.responded_at,
  }
}

function toClub(row: ClubRow, members: ClubMember[]): Club {
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
    canceledReason: row.canceled_reason,
    members,
  }
}

/** 여러 모임의 멤버를 한 번에 읽어 club_id로 묶는다(N+1 방지). */
function membersByClub(clubIds: number[]): Map<number, ClubMember[]> {
  const out = new Map<number, ClubMember[]>()
  if (clubIds.length === 0) return out

  const placeholders = clubIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT m.*, u.name AS user_name, u.department AS department
       FROM club_members m JOIN users u ON u.id = m.user_id
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

function hydrate(rows: ClubRow[]): Club[] {
  const byClub = membersByClub(rows.map((r) => r.id))
  return rows.map((r) => toClub(r, byClub.get(r.id) ?? []))
}

export interface ProposalInput {
  bookId: number
  matchScore: number
  matchReason: string
  agenda: ClubAgendaItem[]
  members: { userId: number; role: ClubMemberRole }[]
  inviteExpiresAt: string
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
    // DB의 created_at과 비교하므로 SQLite 포맷으로 맞춘다(toDbTime 주석 참고).
    const cooldownSince = toDbTime(
      new Date(now.getTime() - CLUB_RULES.personCooldownWeeks * 7 * 24 * 60 * 60 * 1000)
    )
    const bookSince = toDbTime(
      new Date(now.getTime() - CLUB_RULES.bookCooldownMonths * 30 * 24 * 60 * 60 * 1000)
    )

    const activePlaceholders = ACTIVE_STATUSES.map(() => '?').join(',')
    const busy = db
      .prepare(
        `SELECT DISTINCT m.user_id AS id FROM club_members m JOIN clubs c ON c.id = m.club_id
         WHERE c.status IN (${activePlaceholders})`
      )
      .all(...ACTIVE_STATUSES) as { id: number }[]

    const cooled = db
      .prepare(
        `SELECT DISTINCT m.user_id AS id FROM club_members m JOIN clubs c ON c.id = m.club_id
         WHERE c.status = 'done' AND c.created_at >= ?`
      )
      .all(cooldownSince) as { id: number }[]

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
}
