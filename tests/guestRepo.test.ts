import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { guestRepo } from '../server/repositories/guestRepo'

function insertUser(name: string, isGuest: boolean): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role, is_guest)
       VALUES (?, '바텍', '심사', '심사위원', '위원', 'M', 1990, 'member', ?)`
    )
    .run(name, isGuest ? 1 : 0)
  return Number(result.lastInsertRowid)
}

beforeEach(() => {
  initDb(':memory:')
})

describe('guestRepo.list — 게스트 목록과 선점 여부', () => {
  it('is_guest인 사용자만 돌려주고, 선점되면 claimed가 true가 된다', () => {
    const g1 = insertUser('게스트 1', true)
    insertUser('게스트 2', true)
    insertUser('김민우', false)

    expect(guestRepo.list().map((g) => g.name)).toEqual(['게스트 1', '게스트 2'])
    expect(guestRepo.list().every((g) => g.claimed === false)).toBe(true)

    guestRepo.claim(g1)
    expect(guestRepo.list().find((g) => g.id === g1)?.claimed).toBe(true)
  })
})

describe('guestRepo.claim — 선점은 한 명만 성공한다', () => {
  it('첫 선점은 토큰을 돌려주고, 같은 게스트를 다시 선점하면 undefined', () => {
    const g1 = insertUser('게스트 1', true)
    const first = guestRepo.claim(g1)
    expect(first?.user.id).toBe(g1)
    expect(first?.token).toMatch(/^[0-9a-f]{32}$/)

    expect(guestRepo.claim(g1)).toBeUndefined()
  })

  it('게스트가 아닌 사용자는 선점할 수 없다', () => {
    const minwoo = insertUser('김민우', false)
    expect(guestRepo.claim(minwoo)).toBeUndefined()
  })
})

describe('guestRepo.release / releaseAll — 해제하면 다시 선점 가능', () => {
  it('release는 그 게스트만 풀고, releaseAll은 전부 푼다', () => {
    const g1 = insertUser('게스트 1', true)
    const g2 = insertUser('게스트 2', true)
    guestRepo.claim(g1)
    guestRepo.claim(g2)

    guestRepo.release(g1)
    expect(guestRepo.claim(g1)).toBeDefined()
    expect(guestRepo.claim(g2)).toBeUndefined()

    guestRepo.releaseAll()
    expect(guestRepo.list().every((g) => g.claimed === false)).toBe(true)
  })
})

describe('guestRepo.resolveUser — x-user-id + x-guest-token 검증', () => {
  it('일반 사용자는 토큰 없이 통과한다', () => {
    const minwoo = insertUser('김민우', false)
    expect(guestRepo.resolveUser(minwoo, undefined)?.name).toBe('김민우')
  })

  it('게스트는 선점 토큰이 일치할 때만 통과한다', () => {
    const g1 = insertUser('게스트 1', true)
    expect(guestRepo.resolveUser(g1, undefined)).toBeUndefined()

    const { token } = guestRepo.claim(g1)!
    expect(guestRepo.resolveUser(g1, token)?.id).toBe(g1)
    expect(guestRepo.resolveUser(g1, 'wrong')).toBeUndefined()
  })

  it('전체 해제 뒤에는 기존 토큰이 무효가 되고, 재선점한 새 토큰만 통과한다', () => {
    const g1 = insertUser('게스트 1', true)
    const old = guestRepo.claim(g1)!.token
    guestRepo.releaseAll()
    expect(guestRepo.resolveUser(g1, old)).toBeUndefined()

    const fresh = guestRepo.claim(g1)!.token
    expect(fresh).not.toBe(old)
    expect(guestRepo.resolveUser(g1, fresh)?.id).toBe(g1)
  })

  it('없는 사용자 id는 undefined', () => {
    expect(guestRepo.resolveUser(999, undefined)).toBeUndefined()
  })
})
