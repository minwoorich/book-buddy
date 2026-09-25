import { getDb } from '../db/connection'
import type { ClubMessage } from '../../shared/types'

interface Row { id: number; club_id: number; user_id: number | null; user_name: string | null; department: string | null; kind: 'chat' | 'system'; body: string; created_at: string }

const SELECT = `SELECT m.*, u.name AS user_name, u.department AS department
                FROM club_messages m LEFT JOIN users u ON u.id = m.user_id`

function toMessage(r: Row): ClubMessage {
  return { id: r.id, clubId: r.club_id, userId: r.user_id, userName: r.user_name, department: r.department, kind: r.kind, body: r.body, createdAt: r.created_at }
}

export const clubMessageRepo = {
  insert(clubId: number, userId: number | null, kind: 'chat' | 'system', body: string): ClubMessage {
    const id = Number(getDb().prepare(`INSERT INTO club_messages (club_id, user_id, kind, body) VALUES (?, ?, ?, ?)`).run(clubId, userId, kind, body).lastInsertRowid)
    return this.findById(id)!
  },

  findById(id: number): ClubMessage | undefined {
    const row = getDb().prepare(`${SELECT} WHERE m.id = ?`).get(id) as Row | undefined
    return row ? toMessage(row) : undefined
  },

  /** 최신 limit개(beforeId가 있으면 그 앞의 것)를 오래된 → 최신 순으로. */
  listBefore(clubId: number, beforeId: number | null, limit: number): ClubMessage[] {
    const rows = (beforeId === null
      ? getDb().prepare(`${SELECT} WHERE m.club_id = ? ORDER BY m.id DESC LIMIT ?`).all(clubId, limit)
      : getDb().prepare(`${SELECT} WHERE m.club_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(clubId, beforeId, limit)) as Row[]
    return rows.reverse().map(toMessage)
  },

  /** 읽음 표시는 앞으로만 간다(작은 id로 되돌리지 않는다). */
  markRead(clubId: number, userId: number, lastReadId: number): void {
    getDb()
      .prepare(
        `INSERT INTO club_message_reads (club_id, user_id, last_read_id) VALUES (?, ?, ?)
         ON CONFLICT(club_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`
      )
      .run(clubId, userId, lastReadId)
  },

  /** 모임별 안 읽은 chat 메시지 수(내가 쓴 것·시스템 메시지 제외). 없는 모임은 Map에 없다. */
  unreadCounts(userId: number, clubIds: number[]): Map<number, number> {
    const out = new Map<number, number>()
    if (clubIds.length === 0) return out
    const placeholders = clubIds.map(() => '?').join(',')
    const rows = getDb()
      .prepare(
        `SELECT m.club_id AS clubId, COUNT(*) AS n
         FROM club_messages m LEFT JOIN club_message_reads r ON r.club_id = m.club_id AND r.user_id = ?
         WHERE m.club_id IN (${placeholders}) AND m.kind = 'chat' AND (m.user_id IS NULL OR m.user_id != ?)
           AND m.id > COALESCE(r.last_read_id, 0)
         GROUP BY m.club_id`
      )
      .all(userId, ...clubIds, userId) as { clubId: number; n: number }[]
    for (const r of rows) out.set(r.clubId, r.n)
    return out
  },
}
