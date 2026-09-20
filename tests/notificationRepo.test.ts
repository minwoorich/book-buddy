import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { notificationRepo } from '../server/repositories/notificationRepo'

function insertUser(name: string): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO users (name, company, department, team, position, gender, birth_year)
         VALUES (?, '바텍', '개발본부', '1팀', '사원', 'F', 1995)`
      )
      .run(name).lastInsertRowid
  )
}

beforeEach(() => {
  initDb(':memory:')
})

describe('notificationRepo', () => {
  it('insert한 알림을 최신순으로 읽어온다', () => {
    const me = insertUser('김독서')
    notificationRepo.insert(me, 'club_invited', '첫 알림')
    notificationRepo.insert(me, 'club_invited', '두 번째 알림')

    const items = notificationRepo.listForUser(me)
    expect(items.map((n) => n.title)).toEqual(['두 번째 알림', '첫 알림'])
    expect(items[0]?.readAt).toBeNull()
  })

  it('남의 알림은 보이지 않는다', () => {
    const me = insertUser('김독서')
    const other = insertUser('이완독')
    notificationRepo.insert(other, 'club_invited', '남의 알림')

    expect(notificationRepo.listForUser(me)).toHaveLength(0)
  })

  it('unreadCount는 안 읽은 것만 센다', () => {
    const me = insertUser('김독서')
    const first = notificationRepo.insert(me, 'club_invited', '첫 알림')
    notificationRepo.insert(me, 'club_invited', '두 번째 알림')

    expect(notificationRepo.unreadCount(me)).toBe(2)
    notificationRepo.markRead(me, [first.id])
    expect(notificationRepo.unreadCount(me)).toBe(1)
  })

  it('markRead를 ids 없이 부르면 전부 읽음 처리한다', () => {
    const me = insertUser('김독서')
    notificationRepo.insert(me, 'club_invited', '첫 알림')
    notificationRepo.insert(me, 'club_invited', '두 번째 알림')

    notificationRepo.markRead(me)
    expect(notificationRepo.unreadCount(me)).toBe(0)
  })

  it('markRead는 남의 알림을 건드리지 않는다', () => {
    const me = insertUser('김독서')
    const other = insertUser('이완독')
    const hers = notificationRepo.insert(other, 'club_invited', '남의 알림')

    notificationRepo.markRead(me, [hers.id])
    expect(notificationRepo.unreadCount(other)).toBe(1)
  })

  it('insertMany는 여러 사람에게 같은 알림을 남긴다', () => {
    const a = insertUser('A')
    const b = insertUser('B')
    notificationRepo.insertMany([a, b], 'club_invited', '초대가 왔어요', '하드씽', '/clubs/1')

    expect(notificationRepo.listForUser(a)[0]?.link).toBe('/clubs/1')
    expect(notificationRepo.listForUser(b)[0]?.body).toBe('하드씽')
  })

  it('has는 같은 종류·같은 링크의 알림이 이미 있는지 알려준다', () => {
    const me = insertUser('김독서')
    notificationRepo.insert(me, 'club_invite_expiring', '곧 마감돼요', '', '/clubs/1')

    expect(notificationRepo.has(me, 'club_invite_expiring', '/clubs/1')).toBe(true)
    expect(notificationRepo.has(me, 'club_invite_expiring', '/clubs/2')).toBe(false)
    expect(notificationRepo.has(me, 'club_confirmed', '/clubs/1')).toBe(false)
  })

  it('listForUser는 기본 20건까지만 준다', () => {
    const me = insertUser('김독서')
    for (let i = 0; i < 25; i += 1) notificationRepo.insert(me, 'club_invited', `알림 ${i}`)

    expect(notificationRepo.listForUser(me)).toHaveLength(20)
    expect(notificationRepo.listForUser(me, 5)).toHaveLength(5)
  })
})
