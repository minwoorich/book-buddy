import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { clubRepo } from '../server/repositories/clubRepo'
import { toDbTime } from '../server/utils/dbTime'

const NOW = new Date('2026-09-20T00:00:00Z')

function insertBook(title: string): number {
  return Number(
    getDb()
      .prepare(`INSERT INTO books (title, author, category) VALUES (?, '저자', '경제경영')`)
      .run(title).lastInsertRowid
  )
}

function insertUser(name: string, department = '개발본부', isGuest = 0): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO users (name, company, department, team, position, gender, birth_year, is_guest)
         VALUES (?, '바텍', ?, '1팀', '사원', 'F', 1995, ?)`
      )
      .run(name, department, isGuest).lastInsertRowid
  )
}

/** 완독(반납 완료) 대출 한 건. daysAgo만큼 과거에 반납한 것으로 만든다. */
function insertReturnedLoan(bookId: number, userId: number, daysAgo: number): void {
  getDb()
    .prepare(
      `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at)
       VALUES (?, ?, datetime('now', ?), datetime('now'), datetime('now', ?))`
    )
    .run(bookId, userId, `-${daysAgo + 14} day`, `-${daysAgo} day`)
}

beforeEach(() => {
  initDb(':memory:')
})

describe('clubRepo.insertProposal / findById', () => {
  it('제안을 만들고 멤버·아젠다와 함께 다시 읽어온다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    const b = insertUser('이완독', '영업본부')

    const club = clubRepo.insertProposal({
      bookId,
      matchScore: 0.72,
      matchReason: '2명이 최근 같은 책을 완독했어요',
      agenda: [{ question: '저자의 결론이 현장에서 통할까요?', evidence: [{ userId: a, userName: '김독서', quote: '통쾌했다' }] }],
      members: [
        { userId: a, role: 'host' },
        { userId: b, role: 'member' },
      ],
      inviteExpiresAt: '2026-09-23T00:00:00Z',
    })

    const found = clubRepo.findById(club.id)
    expect(found?.status).toBe('proposed')
    expect(found?.bookTitle).toBe('하드씽')
    expect(found?.matchScore).toBeCloseTo(0.72)
    expect(found?.agenda[0]?.question).toContain('저자의 결론')
    expect(found?.members.map((m) => m.role)).toEqual(['host', 'member'])
    expect(found?.members.every((m) => m.inviteStatus === 'invited')).toBe(true)
  })

  it('없는 id는 undefined', () => {
    expect(clubRepo.findById(999)).toBeUndefined()
  })
})

describe('clubRepo 상태·초대 갱신', () => {
  it('updateStatus로 상태를 바꾸고 취소 사유를 남긴다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })

    clubRepo.updateStatus(club.id, 'canceled', { canceledReason: '정원 미달' })
    const found = clubRepo.findById(club.id)
    expect(found?.status).toBe('canceled')
    expect(found?.canceledReason).toBe('정원 미달')
  })

  it('setInviteStatus는 응답 시각을 함께 기록한다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })

    clubRepo.setInviteStatus(club.id, a, 'accepted')
    const member = clubRepo.findById(club.id)?.members[0]
    expect(member?.inviteStatus).toBe('accepted')
    expect(member?.respondedAt).not.toBeNull()
  })

  it('setHost는 기존 호스트를 member로 내리고 새 호스트를 세운다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    const b = insertUser('이완독')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }, { userId: b, role: 'member' }],
      inviteExpiresAt: '2026-09-23T00:00:00Z',
    })

    clubRepo.setHost(club.id, b)
    const roles = Object.fromEntries(clubRepo.findById(club.id)!.members.map((m) => [m.userId, m.role]))
    expect(roles[a]).toBe('member')
    expect(roles[b]).toBe('host')
  })
})

describe('clubRepo.listForUser', () => {
  it('내가 속한 모임만, 최신순으로 준다', () => {
    const bookId = insertBook('하드씽')
    const me = insertUser('김독서')
    const other = insertUser('이완독')

    const mine = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: me, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: other, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })

    expect(clubRepo.listForUser(me).map((c) => c.id)).toEqual([mine.id])
  })
})

describe('clubRepo.findCandidateReaders', () => {
  it('최근 60일 내 완독자가 3명 이상인 책만 후보로 준다', () => {
    const hot = insertBook('하드씽')
    const cold = insertBook('클린 코드')
    const u1 = insertUser('A')
    const u2 = insertUser('B', '영업본부')
    const u3 = insertUser('C', '연구소')

    insertReturnedLoan(hot, u1, 5)
    insertReturnedLoan(hot, u2, 7)
    insertReturnedLoan(hot, u3, 9)
    insertReturnedLoan(cold, u1, 2)
    insertReturnedLoan(cold, u2, 3)

    const map = clubRepo.findCandidateReaders(NOW)
    expect(map.has(hot)).toBe(true)
    expect(map.has(cold)).toBe(false)
    expect(map.get(hot)).toHaveLength(3)
  })

  it('60일보다 오래된 완독은 세지 않는다', () => {
    const bookId = insertBook('하드씽')
    const u1 = insertUser('A')
    const u2 = insertUser('B')
    const u3 = insertUser('C')
    insertReturnedLoan(bookId, u1, 5)
    insertReturnedLoan(bookId, u2, 7)
    insertReturnedLoan(bookId, u3, 200)

    expect(clubRepo.findCandidateReaders(NOW).has(bookId)).toBe(false)
  })

  it('반납하지 않은 대출은 완독으로 보지 않는다', () => {
    const bookId = insertBook('하드씽')
    const u1 = insertUser('A')
    const u2 = insertUser('B')
    const u3 = insertUser('C')
    insertReturnedLoan(bookId, u1, 5)
    insertReturnedLoan(bookId, u2, 7)
    getDb()
      .prepare(`INSERT INTO loans (book_id, user_id, due_at) VALUES (?, ?, datetime('now','+14 day'))`)
      .run(bookId, u3)

    expect(clubRepo.findCandidateReaders(NOW).has(bookId)).toBe(false)
  })

  it('게스트 계정은 후보에서 제외한다', () => {
    const bookId = insertBook('하드씽')
    const u1 = insertUser('A')
    const u2 = insertUser('B')
    const guest = insertUser('게스트1', '개발본부', 1)
    insertReturnedLoan(bookId, u1, 5)
    insertReturnedLoan(bookId, u2, 7)
    insertReturnedLoan(bookId, guest, 8)

    expect(clubRepo.findCandidateReaders(NOW).has(bookId)).toBe(false)
  })

  it('그 책에 남긴 별점을 rating으로 함께 준다', () => {
    const bookId = insertBook('하드씽')
    const u1 = insertUser('A')
    const u2 = insertUser('B')
    const u3 = insertUser('C')
    ;[u1, u2, u3].forEach((u, i) => insertReturnedLoan(bookId, u, 5 + i))
    getDb()
      .prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, 2, '아쉬웠다')`)
      .run(bookId, u2)

    const readers = clubRepo.findCandidateReaders(NOW).get(bookId)!
    expect(readers.find((r) => r.userId === u2)?.rating).toBe(2)
    expect(readers.find((r) => r.userId === u1)?.rating).toBeNull()
  })
})

describe('clubRepo.quotaState', () => {
  it('진행 중 모임의 멤버는 busy, 그 책은 recentBook으로 잡힌다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })

    const state = clubRepo.quotaState(NOW)
    expect(state.busyUserIds.has(a)).toBe(true)
    expect(state.recentBookIds.has(bookId)).toBe(true)
  })

  it('취소된 모임은 busy로 잡지 않는다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    clubRepo.updateStatus(club.id, 'canceled', { canceledReason: '정원 미달' })

    expect(clubRepo.quotaState(NOW).busyUserIds.has(a)).toBe(false)
  })
})

describe('toDbTime', () => {
  it('SQLite datetime 포맷으로 바꾼다', () => {
    expect(toDbTime(new Date('2026-09-20T13:45:09.123Z'))).toBe('2026-09-20 13:45:09')
  })

  it('DB가 실제로 남기는 값과 같은 방식으로 비교된다', () => {
    const stored = getDb().prepare(`SELECT datetime('now') AS t`).get() as { t: string }
    const past = toDbTime(new Date(Date.now() - 60 * 60 * 1000))
    expect(stored.t > past).toBe(true)
  })
})

describe('2단계: done_at·votes·company', () => {
  it('clubs.done_at 컬럼이 있고 markDone이 status·done_at을 같이 쓴다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })

    clubRepo.markDone(club.id, '2026-09-25T10:00:00.000Z')
    const found = clubRepo.findById(club.id)!
    expect(found.status).toBe('done')
    expect(found.doneAt).toBe('2026-09-25T10:00:00.000Z')
  })

  it('멤버에 company가 실리고 votes는 기본 빈 배열이다', () => {
    const bookId = insertBook('하드씽')
    const a = insertUser('김독서')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    const found = clubRepo.findById(club.id)!
    expect(found.members[0]?.company).toBe('바텍')
    expect(found.votes).toEqual([])
  })

  it('쿨다운은 done_at 기준이다 — 4주 안에 끝난 모임의 멤버만 cooled', () => {
    const bookId = insertBook('하드씽')
    const recent = insertUser('최근종료')
    const old = insertUser('오래전종료')
    const c1 = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: recent, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    const c2 = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: old, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    clubRepo.markDone(c1.id, '2026-09-10T10:00:00.000Z') // 10일 전
    clubRepo.markDone(c2.id, '2026-07-01T10:00:00.000Z') // 80일 전

    const state = clubRepo.quotaState(new Date('2026-09-20T00:00:00Z'))
    expect(state.cooledUserIds.has(recent)).toBe(true)
    expect(state.cooledUserIds.has(old)).toBe(false)
    // 끝난 모임은 busy가 아니다
    expect(state.busyUserIds.has(recent)).toBe(false)
  })
})
