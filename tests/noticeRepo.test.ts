import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { noticeRepo } from '../server/repositories/noticeRepo'
import { parseNoticeInput } from '../server/utils/notice'
import { ApiError } from '../server/utils/errors'

function insertAdmin(): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES ('도서관리자', '바텍', '경영지원', '총무팀', '매니저', 'F', 1990, 'admin')`
    )
    .run()
  return Number(result.lastInsertRowid)
}

beforeEach(() => {
  initDb(':memory:')
})

describe('noticeRepo (QA #55)', () => {
  it('고정 공지가 먼저, 나머지는 최신순으로 나열된다', () => {
    const admin = insertAdmin()
    const first = noticeRepo.insert(admin, { title: '첫 공지', content: '내용', pinned: false })
    const pinned = noticeRepo.insert(admin, { title: '고정 공지', content: '내용', pinned: true })
    const latest = noticeRepo.insert(admin, { title: '최신 공지', content: '내용', pinned: false })

    expect(noticeRepo.listAll().map((n) => n.id)).toEqual([pinned.id, latest.id, first.id])
    expect(noticeRepo.listAll()[0]?.authorName).toBe('도서관리자')
  })

  it('update는 제목·내용·고정 여부를 바꾸고, remove 후에는 조회되지 않는다', () => {
    const admin = insertAdmin()
    const notice = noticeRepo.insert(admin, { title: '제목', content: '내용', pinned: false })
    const updated = noticeRepo.update(notice.id, { title: '고친 제목', content: '고친 내용', pinned: true })
    expect(updated).toMatchObject({ title: '고친 제목', content: '고친 내용', pinned: true })

    noticeRepo.remove(notice.id)
    expect(noticeRepo.findById(notice.id)).toBeUndefined()
  })
})

describe('parseNoticeInput', () => {
  it('제목·내용을 trim하고 pinned를 불리언으로 정규화한다', () => {
    expect(parseNoticeInput({ title: '  제목 ', content: ' 내용 ', pinned: '1' })).toEqual({
      title: '제목',
      content: '내용',
      pinned: true,
    })
  })

  it('제목이나 내용이 비면 400', () => {
    expect(() => parseNoticeInput({ title: '', content: '내용' })).toThrow(ApiError)
    expect(() => parseNoticeInput({ title: '제목', content: '   ' })).toThrow(ApiError)
  })
})
