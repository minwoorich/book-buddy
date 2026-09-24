import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'

beforeEach(() => {
  initDb(':memory:')
})

describe('책모임 스키마', () => {
  it('clubs/club_members/club_votes/notifications 테이블이 생긴다', () => {
    const names = getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => (r as { name: string }).name)

    expect(names).toEqual(expect.arrayContaining(['clubs', 'club_members', 'club_votes', 'notifications']))
  })

  it('clubs.status는 정의된 6개 값만 받는다', () => {
    const db = getDb()
    const bookId = Number(
      db.prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','벤 호로위츠','경제경영')`).run()
        .lastInsertRowid
    )

    expect(() =>
      db.prepare(`INSERT INTO clubs (book_id, status) VALUES (?, 'bogus')`).run(bookId)
    ).toThrow()
    expect(() => db.prepare(`INSERT INTO clubs (book_id, status) VALUES (?, 'proposed')`).run(bookId)).not.toThrow()
  })

  it('club_members는 (club_id, user_id) 중복을 막는다', () => {
    const db = getDb()
    const bookId = Number(
      db.prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','벤 호로위츠','경제경영')`).run()
        .lastInsertRowid
    )
    const clubId = Number(db.prepare(`INSERT INTO clubs (book_id) VALUES (?)`).run(bookId).lastInsertRowid)
    const userId = Number(
      db
        .prepare(
          `INSERT INTO users (name, company, department, team, position, gender, birth_year)
           VALUES ('김독서','바텍','개발본부','1팀','사원','F',1995)`
        )
        .run().lastInsertRowid
    )

    db.prepare(`INSERT INTO club_members (club_id, user_id) VALUES (?, ?)`).run(clubId, userId)
    expect(() =>
      db.prepare(`INSERT INTO club_members (club_id, user_id) VALUES (?, ?)`).run(clubId, userId)
    ).toThrow()
  })

  it('clubs에 origin·created_by·title·description·capacity·recruit_until 열과 club_posts 테이블이 생긴다', () => {
    const db = getDb()
    const cols = (db.prepare('PRAGMA table_info(clubs)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['origin', 'created_by', 'title', 'description', 'capacity', 'recruit_until']))
    const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name)
    expect(names).toContain('club_posts')

    const bookId = Number(db.prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','저자','경제경영')`).run().lastInsertRowid)
    const clubId = Number(db.prepare(`INSERT INTO clubs (book_id) VALUES (?)`).run(bookId).lastInsertRowid)
    const row = db.prepare(`SELECT origin, description, capacity FROM clubs WHERE id = ?`).get(clubId) as { origin: string; description: string; capacity: number }
    expect(row).toEqual({ origin: 'agent', description: '', capacity: 5 })
    expect(() => db.prepare(`UPDATE clubs SET origin = 'bogus' WHERE id = ?`).run(clubId)).toThrow()
  })
})
