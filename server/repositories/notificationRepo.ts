import { getDb } from '../db/connection'
import type { AppNotification } from '../../shared/types'

interface NotificationRow {
  id: number
  user_id: number
  type: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

/** 벨을 눌렀을 때 한 번에 보여줄 기본 건수. */
const DEFAULT_LIMIT = 20

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

/**
 * 범용 인앱 알림. 책모임에서 처음 쓰지만 책모임 전용이 아니다 —
 * 연체 임박·예약 차례 도착 등에 그대로 재사용한다.
 */
export const notificationRepo = {
  insert(userId: number, type: string, title: string, body = '', link: string | null = null): AppNotification {
    const id = Number(
      getDb()
        .prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)`)
        .run(userId, type, title, body, link).lastInsertRowid
    )
    const row = getDb().prepare(`SELECT * FROM notifications WHERE id = ?`).get(id) as NotificationRow
    return toNotification(row)
  },

  /** 같은 알림을 여러 사람에게. 한 명이라도 실패하면 전부 되돌린다. */
  insertMany(userIds: number[], type: string, title: string, body = '', link: string | null = null): void {
    if (userIds.length === 0) return
    const db = getDb()
    const stmt = db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)`)
    const run = db.transaction(() => {
      for (const userId of userIds) stmt.run(userId, type, title, body, link)
    })
    run()
  },

  listForUser(userId: number, limit = DEFAULT_LIMIT): AppNotification[] {
    const rows = getDb()
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
      .all(userId, limit) as NotificationRow[]
    return rows.map(toNotification)
  },

  unreadCount(userId: number): number {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL`)
      .get(userId) as { c: number }
    return row.c
  },

  /**
   * 읽음 처리. ids를 주면 그것만, 없으면 전부.
   * user_id 조건을 항상 함께 걸어 남의 알림을 건드리지 못하게 한다.
   */
  /**
   * 같은 종류·같은 링크의 알림이 이미 있는지. 주기 작업이 하루에 여러 번 돌아도
   * 같은 리마인드를 중복으로 쌓지 않으려고 쓴다.
   */
  has(userId: number, type: string, link: string | null): boolean {
    const row = getDb()
      .prepare(`SELECT 1 AS hit FROM notifications WHERE user_id = ? AND type = ? AND link IS ? LIMIT 1`)
      .get(userId, type, link) as { hit: number } | undefined
    return row !== undefined
  },

  markRead(userId: number, ids?: number[]): void {
    const db = getDb()
    if (!ids) {
      db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`).run(userId)
      return
    }
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE user_id = ? AND read_at IS NULL AND id IN (${placeholders})`
    ).run(userId, ...ids)
  },
}
