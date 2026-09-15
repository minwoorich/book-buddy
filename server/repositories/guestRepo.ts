import { randomBytes } from 'node:crypto'
import { getDb } from '../db/connection'
import { userRepo } from './userRepo'
import type { User } from '../../shared/types'

export interface GuestSlot extends User {
  claimed: boolean
}

export interface GuestClaim {
  user: User
  token: string
}

/**
 * 시연용 게스트 선점. 게스트(users.is_guest=1)는 guest_claims에 한 줄 INSERT로 "선점"되고,
 * 그때 발급된 토큰을 매 요청 x-guest-token으로 제출해야 인증이 통과한다.
 * PK 충돌이 곧 "이미 선점됨"이라 동시 클릭도 한 명만 성공한다.
 */
export const guestRepo = {
  list(): GuestSlot[] {
    const rows = getDb()
      .prepare(
        `SELECT u.*, (c.user_id IS NOT NULL) AS claimed
         FROM users u LEFT JOIN guest_claims c ON c.user_id = u.id
         WHERE u.is_guest = 1 ORDER BY u.id`
      )
      .all() as { id: number; claimed: number }[]
    return rows.map((row) => ({ ...userRepo.findById(row.id)!, claimed: row.claimed === 1 }))
  },

  /** 선점 성공이면 토큰과 사용자, 이미 선점됐거나 게스트가 아니면 undefined. */
  claim(userId: number): GuestClaim | undefined {
    const user = userRepo.findById(userId)
    if (!user?.isGuest) return undefined
    const token = randomBytes(16).toString('hex')
    try {
      getDb().prepare('INSERT INTO guest_claims (user_id, token) VALUES (?, ?)').run(userId, token)
    } catch {
      // PK 충돌 = 이미 선점됨
      return undefined
    }
    return { user, token }
  },

  release(userId: number): void {
    getDb().prepare('DELETE FROM guest_claims WHERE user_id = ?').run(userId)
  },

  releaseAll(): void {
    getDb().prepare('DELETE FROM guest_claims').run()
  },

  /** x-user-id(+x-guest-token) → 사용자. 게스트는 선점 토큰이 일치해야 하고, 일반 사용자는 그대로 통과. */
  resolveUser(userId: number, token: string | undefined): User | undefined {
    const user = userRepo.findById(userId)
    if (!user) return undefined
    if (!user.isGuest) return user
    if (!token) return undefined
    const row = getDb().prepare('SELECT token FROM guest_claims WHERE user_id = ?').get(userId) as
      | { token: string }
      | undefined
    return row?.token === token ? user : undefined
  },
}
