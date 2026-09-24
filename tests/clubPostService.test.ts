import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { notificationRepo } from '../server/repositories/notificationRepo'
import { clubPostService } from '../server/services/clubPostService'
import { ApiError } from '../server/utils/errors'

const NOW = new Date('2026-09-24T05:00:00Z')   // 9/24 14:00 KST

function insertBook(): number {
  return Number(getDb().prepare(`INSERT INTO books (title, author, category) VALUES ('하드씽','저자','경제경영')`).run().lastInsertRowid)
}
function insertUser(name: string): number {
  return Number(
    getDb().prepare(`INSERT INTO users (name, company, department, team, position, gender, birth_year) VALUES (?, '바텍', '개발본부', '1팀', '사원', 'F', 1995)`).run(name).lastInsertRowid
  )
}
/** 호스트 + 수락자 2 + 초대만 받은 1. */
function setup() {
  const bookId = insertBook()
  const host = insertUser('개설자'); const a = insertUser('a'); const b = insertUser('b'); const invited = insertUser('초대만')
  const club = clubRepo.createUserClub({ bookId, createdBy: host, title: '같이', description: '', capacity: 5, recruitUntilIso: '2026-10-01T23:59:59.000Z' })
  clubRepo.upsertMember(club.id, a, 'member', 'accepted')
  clubRepo.upsertMember(club.id, b, 'member', 'accepted')
  clubRepo.upsertMember(club.id, invited, 'member', 'invited')
  return { club, host, a, b, invited, outsider: insertUser('외부') }
}

beforeEach(() => { initDb(':memory:') })

describe('clubPostService.create / list', () => {
  it('수락자만 쓰고 읽는다; 글은 최신순, 댓글은 시간순으로 글 아래 붙는다', () => {
    const { club, host, a, invited, outsider } = setup()
    const p1 = clubPostService.create(club.id, host, { body: '첫 글' }, NOW)
    const p2 = clubPostService.create(club.id, a, { body: '둘째 글' }, NOW)
    const r1 = clubPostService.create(club.id, a, { body: '댓글1', parentId: p1.id }, NOW)
    const r2 = clubPostService.create(club.id, host, { body: '댓글2', parentId: p1.id }, NOW)

    const list = clubPostService.list(club.id, a)
    expect(list.map((p) => p.id)).toEqual([p2.id, p1.id])
    expect(list[1]!.replies.map((r) => r.id)).toEqual([r1.id, r2.id])
    expect(list[1]!.replies[0]).toMatchObject({ userName: 'a', department: '개발본부', parentId: p1.id })

    expect(() => clubPostService.list(club.id, invited)).toThrow(ApiError)
    expect(() => clubPostService.list(club.id, outsider)).toThrow(ApiError)
    expect(() => clubPostService.create(club.id, invited, { body: 'x' }, NOW)).toThrow(ApiError)
  })

  it('본문 1~2000자, 댓글의 댓글 400, 다른 모임 글에 댓글 400, 끝난 모임엔 쓰기 400(읽기는 됨)', () => {
    const { club, host } = setup()
    expect(() => clubPostService.create(club.id, host, { body: '   ' }, NOW)).toThrow(ApiError)
    expect(() => clubPostService.create(club.id, host, { body: 'x'.repeat(2001) }, NOW)).toThrow(ApiError)
    const p = clubPostService.create(club.id, host, { body: '글' }, NOW)
    const r = clubPostService.create(club.id, host, { body: '댓글', parentId: p.id }, NOW)
    expect(() => clubPostService.create(club.id, host, { body: '대댓글', parentId: r.id }, NOW)).toThrow(/댓글에는/)
    expect(() => clubPostService.create(club.id, host, { body: 'x', parentId: 999 }, NOW)).toThrow(ApiError)

    clubRepo.updateStatus(club.id, 'done')
    expect(() => clubPostService.create(club.id, host, { body: '늦은 글' }, NOW)).toThrow(/끝난/)
    expect(clubPostService.list(club.id, host)).toHaveLength(1)
  })

  it('club_post 알림 — 작성자 제외 수락자에게, 같은 모임은 KST 하루 1건, 댓글은 없음', () => {
    const { club, host, a, b, invited } = setup()
    clubPostService.create(club.id, host, { body: '첫 글' }, NOW)
    clubPostService.create(club.id, host, { body: '둘째 글' }, new Date('2026-09-24T10:00:00Z'))   // 같은 KST 날짜
    const p = clubPostService.create(club.id, a, { body: '셋째 글' }, NOW)
    clubPostService.create(club.id, b, { body: '댓글', parentId: p.id }, NOW)

    const forB = notificationRepo.listForUser(b).filter((n) => n.type === 'club_post')
    expect(forB).toHaveLength(1)
    expect(forB[0]!.link).toBe(`/clubs/${club.id}?posts=2026-09-24`)
    expect(notificationRepo.listForUser(host).filter((n) => n.type === 'club_post')).toHaveLength(1)   // a의 글
    expect(notificationRepo.listForUser(invited).filter((n) => n.type === 'club_post')).toHaveLength(0)

    clubPostService.create(club.id, host, { body: '다음 날 글' }, new Date('2026-09-24T16:00:00Z'))   // 9/25 01:00 KST
    expect(notificationRepo.listForUser(b).filter((n) => n.type === 'club_post')).toHaveLength(2)
  })
})

describe('clubPostService.remove', () => {
  it('작성자 또는 호스트만, 글을 지우면 댓글도', () => {
    const { club, host, a, b } = setup()
    const p = clubPostService.create(club.id, a, { body: '글' }, NOW)
    clubPostService.create(club.id, b, { body: '댓글', parentId: p.id }, NOW)

    expect(() => clubPostService.remove(club.id, b, p.id)).toThrow(ApiError)
    clubPostService.remove(club.id, host, p.id)
    expect(clubPostService.list(club.id, host)).toHaveLength(0)
    expect(getDb().prepare(`SELECT COUNT(*) AS n FROM club_posts`).get()).toEqual({ n: 0 })
    expect(() => clubPostService.remove(club.id, host, p.id)).toThrow(ApiError)
  })
})
