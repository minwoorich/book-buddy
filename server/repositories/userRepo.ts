import { getDb } from '../db/connection'
import type { User } from '../../shared/types'

interface UserRow {
  id: number
  name: string
  company: string
  department: string
  team: string
  position: string
  gender: 'M' | 'F'
  birth_year: number
  role: 'member' | 'admin'
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    department: row.department,
    team: row.team,
    position: row.position,
    gender: row.gender,
    birthYear: row.birth_year,
    role: row.role,
  }
}

export const userRepo = {
  findAll(): User[] {
    const rows = getDb().prepare('SELECT * FROM users').all() as UserRow[]
    return rows.map(toUser)
  },

  findById(id: number): User | undefined {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
    return row ? toUser(row) : undefined
  },
}
