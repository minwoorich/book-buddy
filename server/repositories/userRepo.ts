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

// findByName 전용: password 컬럼까지 포함한 행. 공개 User 타입에는 절대 섞이지 않는다
// (로그인 검증 이후 곧바로 벗겨낸다) — 데모용 평문 비밀번호, 시연 종료와 함께 폐기.
interface UserRowWithPassword extends UserRow {
  password: string
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

  /** 로그인 검증 전용. password를 포함해 반환하므로 응답에 그대로 흘려보내면 안 된다. */
  findByName(name: string): (User & { password: string }) | undefined {
    const row = getDb().prepare('SELECT * FROM users WHERE name = ?').get(name) as
      | UserRowWithPassword
      | undefined
    return row ? { ...toUser(row), password: row.password } : undefined
  },

  /** 회원가입 전용. role은 'member' 고정, password는 평문 그대로 저장한다(데모용 — 시연 종료와 함께 폐기). */
  insert(input: {
    name: string
    password: string
    company: string
    department: string
    team: string
    position: string
    gender: 'M' | 'F'
    birthYear: number
  }): User {
    const result = getDb()
      .prepare(
        `INSERT INTO users (name, company, department, team, position, gender, birth_year, role, password)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'member', ?)`
      )
      .run(
        input.name,
        input.company,
        input.department,
        input.team,
        input.position,
        input.gender,
        input.birthYear,
        input.password
      )
    const user = userRepo.findById(Number(result.lastInsertRowid))
    if (!user) throw new Error('방금 생성한 사용자를 다시 조회하지 못했어요')
    return user
  },
}
