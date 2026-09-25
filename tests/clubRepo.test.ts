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

  it('busy·cooled는 실제로 참여한 사람만 잡는다 — 거절했거나 응답 안 한 사람은 제외', () => {
    const bookId = insertBook('하드씽')
    const decliner = insertUser('거절함')
    const host = insertUser('호스트')
    const active = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: host, role: 'host' }, { userId: decliner, role: 'member' }],
      inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    clubRepo.setInviteStatus(active.id, decliner, 'declined')

    const neverResponded = insertUser('무응답')
    const done = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: neverResponded, role: 'host' }],
      inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    clubRepo.markDone(done.id, '2026-09-10T10:00:00.000Z')

    const state = clubRepo.quotaState(NOW)
    expect(state.busyUserIds.has(decliner)).toBe(false)
    expect(state.busyUserIds.has(host)).toBe(true)
    expect(state.cooledUserIds.has(neverResponded)).toBe(false)
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
    clubRepo.setInviteStatus(c1.id, recent, 'accepted')
    clubRepo.setInviteStatus(c2.id, old, 'accepted')
    clubRepo.markDone(c1.id, '2026-09-10T10:00:00.000Z') // 10일 전
    clubRepo.markDone(c2.id, '2026-07-01T10:00:00.000Z') // 80일 전

    const state = clubRepo.quotaState(new Date('2026-09-20T00:00:00Z'))
    expect(state.cooledUserIds.has(recent)).toBe(true)
    expect(state.cooledUserIds.has(old)).toBe(false)
    // 끝난 모임은 busy가 아니다
    expect(state.busyUserIds.has(recent)).toBe(false)
  })
})

describe('2단계: 일정 메서드', () => {
  function proposal(members: number[]) {
    const bookId = insertBook('하드씽')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: members.map((userId, i) => ({ userId, role: i === 0 ? ('host' as const) : ('member' as const) })),
      inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    return { bookId, club }
  }

  it('setCandidateSlots는 시간순으로 저장하고 vote_expires_at을 쓴다', () => {
    const { club } = proposal([insertUser('A')])
    clubRepo.setCandidateSlots(club.id, ['2026-09-30T09:30:00.000Z', '2026-09-28T03:00:00.000Z'], '2026-09-26T23:59:59.000Z')
    const found = clubRepo.findById(club.id)!
    expect(found.candidateSlots).toEqual(['2026-09-28T03:00:00.000Z', '2026-09-30T09:30:00.000Z'])
    expect(found.voteExpiresAt).toBe('2026-09-26T23:59:59.000Z')
  })

  it('confirm은 status와 meet_at을 함께 쓴다', () => {
    const { club } = proposal([insertUser('A')])
    clubRepo.confirm(club.id, '2026-09-28T09:30:00.000Z')
    const found = clubRepo.findById(club.id)!
    expect(found.status).toBe('confirmed')
    expect(found.meetAt).toBe('2026-09-28T09:30:00.000Z')
  })

  it('castVotes는 그 사람의 표를 통째로 바꾼다', () => {
    const a = insertUser('A')
    const { club } = proposal([a])
    clubRepo.castVotes(club.id, a, [0, 2])
    expect(clubRepo.findById(club.id)!.votes).toEqual([{ userId: a, slotIdx: 0 }, { userId: a, slotIdx: 2 }])
    clubRepo.castVotes(club.id, a, [1])
    expect(clubRepo.findById(club.id)!.votes).toEqual([{ userId: a, slotIdx: 1 }])
  })

  it('busyIntervalsFor는 수락한 다른 confirmed 모임의 구간만 준다', () => {
    const a = insertUser('A')
    const other = proposal([a]).club
    clubRepo.setInviteStatus(other.id, a, 'accepted')
    clubRepo.confirm(other.id, '2026-09-28T09:30:00.000Z') // 저녁 90분
    const mine = proposal([a]).club

    expect(clubRepo.busyIntervalsFor([a], mine.id)).toEqual([
      { start: '2026-09-28T09:30:00.000Z', end: '2026-09-28T11:00:00.000Z' },
    ])
    // 자기 자신은 제외
    expect(clubRepo.busyIntervalsFor([a], other.id)).toEqual([])
  })

  it('earliestDueAtFor는 반납 안 한 그 책 대출의 가장 이른 due_at', () => {
    const a = insertUser('A')
    const b = insertUser('B')
    const { bookId } = proposal([a, b])
    getDb().prepare(`INSERT INTO loans (book_id, user_id, due_at) VALUES (?, ?, ?)`).run(bookId, a, '2026-10-03T00:00:00.000Z')
    getDb().prepare(`INSERT INTO loans (book_id, user_id, due_at) VALUES (?, ?, ?)`).run(bookId, b, '2026-09-29T00:00:00.000Z')
    expect(clubRepo.earliestDueAtFor(bookId, [a, b])).toBe('2026-09-29T00:00:00.000Z')
    expect(clubRepo.earliestDueAtFor(bookId, [insertUser('C')])).toBeNull()
  })

  it('earliestDueAtFor는 시드 스크립트가 쓰는 SQLite datetime 포맷도 ISO로 바꿔 준다', () => {
    const a = insertUser('A')
    const { bookId } = proposal([a])
    getDb().prepare(`INSERT INTO loans (book_id, user_id, due_at) VALUES (?, ?, ?)`).run(bookId, a, '2026-09-29 00:00:00')
    expect(clubRepo.earliestDueAtFor(bookId, [a])).toBe('2026-09-29T00:00:00.000Z')
  })

  it('reviewerIdsFor / adminUserIds', () => {
    const a = insertUser('A')
    const b = insertUser('B')
    const { bookId } = proposal([a, b])
    getDb().prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, 4, '좋았다')`).run(bookId, b)
    expect([...clubRepo.reviewerIdsFor(bookId, [a, b])]).toEqual([b])

    const admin = Number(getDb().prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES ('도서관리자','바텍','경영지원','총무팀','매니저','F',1990,'admin')`
    ).run().lastInsertRowid)
    expect(clubRepo.adminUserIds()).toEqual([admin])
  })
})

describe('3단계: 장소 메서드', () => {
  const PLACE = { kakaoId: 'k1', name: '스타벅스 광교점', lat: 37.29, lng: 127.05 }
  function proposal() {
    const bookId = insertBook('하드씽')
    const a = insertUser('A')
    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: a, role: 'host' }], inviteExpiresAt: '2026-09-23T00:00:00Z',
    })
    return { club, a }
  }

  it('setPlace는 장소 4필드와 place_decided_at을 쓴다', () => {
    const { club } = proposal()
    clubRepo.setPlace(club.id, PLACE, '2026-09-24T01:00:00.000Z')
    const found = clubRepo.findById(club.id)!
    expect(found.place).toEqual(PLACE)
    expect(found.placeDecidedAt).toBe('2026-09-24T01:00:00.000Z')
  })

  it('upcomingPlaces는 confirmed + 장소 + 미래 모임만, 이른 순', () => {
    const { club: later } = proposal()
    const { club: sooner } = proposal()
    const { club: noPlace } = proposal()
    const { club: past } = proposal()
    for (const c of [later, sooner, noPlace, past]) clubRepo.confirm(c.id, '2026-10-01T09:30:00.000Z')
    clubRepo.confirm(sooner.id, '2026-09-29T09:30:00.000Z')
    clubRepo.confirm(past.id, '2026-09-20T09:30:00.000Z')
    clubRepo.setPlace(later.id, PLACE, '2026-09-24T00:00:00.000Z')
    clubRepo.setPlace(sooner.id, { ...PLACE, kakaoId: 'k2' }, '2026-09-24T00:00:00.000Z')
    clubRepo.setPlace(past.id, PLACE, '2026-09-24T00:00:00.000Z')

    const list = clubRepo.upcomingPlaces('2026-09-25T00:00:00.000Z')
    expect(list.map((u) => u.clubId)).toEqual([sooner.id, later.id])
    expect(list[0]).toMatchObject({ kakaoId: 'k2', bookTitle: '하드씽', meetAt: '2026-09-29T09:30:00.000Z' })
  })

  it('listDoneWithPlace는 done이면서 장소가 있는 모임만', () => {
    const { club: withPlace } = proposal()
    const { club: without } = proposal()
    clubRepo.setPlace(withPlace.id, PLACE, '2026-09-24T00:00:00.000Z')
    clubRepo.markDone(withPlace.id, '2026-09-29T09:30:00.000Z')
    clubRepo.markDone(without.id, '2026-09-29T09:30:00.000Z')
    expect(clubRepo.listDoneWithPlace().map((c) => c.id)).toEqual([withPlace.id])
  })

  it('listDoneWithPlace(sinceIso)는 그 시각 이후에 끝난 모임만 준다', () => {
    const { club: recent } = proposal()
    const { club: old } = proposal()
    clubRepo.setPlace(recent.id, PLACE, '2026-09-24T00:00:00.000Z')
    clubRepo.setPlace(old.id, PLACE, '2026-08-01T00:00:00.000Z')
    clubRepo.markDone(recent.id, '2026-09-29T09:30:00.000Z')
    clubRepo.markDone(old.id, '2026-08-10T09:30:00.000Z')

    expect(clubRepo.listDoneWithPlace('2026-09-01T00:00:00.000Z').map((c) => c.id)).toEqual([recent.id])
    expect(new Set(clubRepo.listDoneWithPlace().map((c) => c.id))).toEqual(new Set([recent.id, old.id]))
  })
})

describe('clubRepo 행 매핑 — origin·모집 열·완독 표시', () => {
  it('기존 제안은 origin=agent, capacity=5, title=null이고 멤버의 completed/reading이 대출 이력으로 채워진다', () => {
    const bookId = insertBook('하드씽')
    const done = insertUser('완독자')
    const reading = insertUser('읽는중')
    const none = insertUser('안읽음')
    insertReturnedLoan(bookId, done, 3)
    getDb()
      .prepare(`INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at) VALUES (?, ?, datetime('now'), datetime('now', '+14 day'), NULL)`)
      .run(bookId, reading)

    const club = clubRepo.insertProposal({
      bookId, matchScore: 0.5, matchReason: '이유', agenda: [],
      members: [{ userId: done, role: 'host' }, { userId: reading, role: 'member' }, { userId: none, role: 'member' }],
      inviteExpiresAt: '2026-09-23T23:59:59.000Z',
    })

    expect(club).toMatchObject({ origin: 'agent', createdBy: null, title: null, description: '', capacity: 5, recruitUntil: null })
    const by = Object.fromEntries(club.members.map((m) => [m.userId, m]))
    expect(by[done]).toMatchObject({ completed: true, reading: false })
    expect(by[reading]).toMatchObject({ completed: false, reading: true })
    expect(by[none]).toMatchObject({ completed: false, reading: false })
  })
})

describe('clubRepo 직접 개설 메서드', () => {
  function userClub(hostId: number, bookId: number, recruitUntilIso = '2026-10-01T23:59:59.000Z') {
    return clubRepo.createUserClub({ bookId, createdBy: hostId, title: '같이 읽어요', description: '소개', capacity: 4, recruitUntilIso })
  }

  it('createUserClub — origin=user·inviting·개설자가 host/accepted', () => {
    const bookId = insertBook('하드씽')
    const host = insertUser('개설자')
    const club = userClub(host, bookId)
    expect(club).toMatchObject({ origin: 'user', status: 'inviting', createdBy: host, title: '같이 읽어요', description: '소개', capacity: 4, recruitUntil: '2026-10-01T23:59:59.000Z', matchScore: 0, agenda: [] })
    expect(club.members).toHaveLength(1)
    expect(club.members[0]).toMatchObject({ userId: host, role: 'host', inviteStatus: 'accepted' })
    expect(club.members[0]!.respondedAt).not.toBeNull()
  })

  it('upsertMember — 없으면 넣고, 있으면 invite_status만 바꾸며 role은 유지한다', () => {
    const bookId = insertBook('하드씽')
    const host = insertUser('개설자')
    const a = insertUser('참가자')
    const club = userClub(host, bookId)

    clubRepo.upsertMember(club.id, a, 'member', 'invited')
    expect(clubRepo.findById(club.id)!.members.find((m) => m.userId === a)).toMatchObject({ role: 'member', inviteStatus: 'invited' })
    clubRepo.upsertMember(club.id, a, 'member', 'accepted')
    expect(clubRepo.findById(club.id)!.members.find((m) => m.userId === a)).toMatchObject({ role: 'member', inviteStatus: 'accepted' })
    // 호스트를 다시 upsert해도 role은 host 그대로
    clubRepo.upsertMember(club.id, host, 'member', 'accepted')
    expect(clubRepo.findById(club.id)!.members.find((m) => m.userId === host)!.role).toBe('host')
    expect(clubRepo.findById(club.id)!.members).toHaveLength(2)
  })

  it('removeMember·declinePending', () => {
    const bookId = insertBook('하드씽')
    const host = insertUser('개설자')
    const a = insertUser('a')
    const b = insertUser('b')
    const club = userClub(host, bookId)
    clubRepo.upsertMember(club.id, a, 'member', 'accepted')
    clubRepo.upsertMember(club.id, b, 'member', 'invited')

    clubRepo.removeMember(club.id, a)
    expect(clubRepo.findById(club.id)!.members.map((m) => m.userId)).toEqual([host, b])
    expect(clubRepo.declinePending(club.id)).toBe(1)
    expect(clubRepo.findById(club.id)!.members.find((m) => m.userId === b)!.inviteStatus).toBe('declined')
  })

  it('hostingRecruitingCount — 호스트로 모집 중인 사람 모임 수', () => {
    const bookId = insertBook('하드씽')
    const host = insertUser('개설자')
    expect(clubRepo.hostingRecruitingCount(host)).toBe(0)
    const club = userClub(host, bookId)
    expect(clubRepo.hostingRecruitingCount(host)).toBe(1)
    clubRepo.updateStatus(club.id, 'scheduling')
    expect(clubRepo.hostingRecruitingCount(host)).toBe(0)
  })

  it('setAgenda·agendaReviewsFor·listActive', () => {
    const bookId = insertBook('하드씽')
    const host = insertUser('개설자')
    const a = insertUser('리뷰어')
    const club = userClub(host, bookId)
    getDb().prepare(`INSERT INTO reviews (book_id, user_id, rating, content) VALUES (?, ?, 4, '좋았다')`).run(bookId, a)

    clubRepo.setAgenda(club.id, [{ question: 'Q?', evidence: [] }])
    expect(clubRepo.findById(club.id)!.agenda).toEqual([{ question: 'Q?', evidence: [] }])
    expect(clubRepo.agendaReviewsFor(bookId, [host, a])).toEqual([{ userId: a, userName: '리뷰어', rating: 4, content: '좋았다' }])
    expect(clubRepo.agendaReviewsFor(bookId, [])).toEqual([])
    expect(clubRepo.listActive().map((c) => c.id)).toEqual([club.id])
    clubRepo.updateStatus(club.id, 'canceled')
    expect(clubRepo.listActive()).toEqual([])
  })

  it('quotaState.busy — 사람 모임 참가자도 busy다', () => {
    const bookId = insertBook('하드씽')
    const host = insertUser('개설자')
    const club = userClub(host, bookId)
    expect(clubRepo.quotaState(NOW).busyUserIds.has(host)).toBe(true)
    expect(clubRepo.quotaState(NOW).recentBookIds.has(bookId)).toBe(true)
    clubRepo.updateStatus(club.id, 'canceled')
    expect(clubRepo.quotaState(NOW).busyUserIds.has(host)).toBe(false)
  })
})

describe('clubRepo 후보·표·열린 모임', () => {
  function userClub(hostId: number, bookId: number, over: Partial<{ recruitUntilIso: string }> = {}) {
    return clubRepo.createUserClub({ bookId, createdBy: hostId, title: '같이', description: '', capacity: 4, recruitUntilIso: over.recruitUntilIso ?? '2026-10-01T23:59:59.000Z' })
  }
  it('setCandidateSlotsOnly는 정렬 저장하고 vote_expires_at을 건드리지 않는다; replaceVotes는 통째로 바꾼다', () => {
    const bookId = insertBook('하드씽'); const host = insertUser('h'); const a = insertUser('a')
    const c = userClub(host, bookId)
    clubRepo.setCandidateSlotsOnly(c.id, ['2026-10-01T09:30:00.000Z', '2026-09-29T09:30:00.000Z'])
    let got = clubRepo.findById(c.id)!
    expect(got.candidateSlots).toEqual(['2026-09-29T09:30:00.000Z', '2026-10-01T09:30:00.000Z'])
    expect(got.voteExpiresAt).toBeNull()
    clubRepo.castVotes(c.id, host, [0, 1]); clubRepo.castVotes(c.id, a, [1])
    clubRepo.replaceVotes(c.id, [{ userId: a, slotIdx: 0 }])
    got = clubRepo.findById(c.id)!
    expect(got.votes).toEqual([{ userId: a, slotIdx: 0 }])
  })
  it('listOpen — 모집 중(기한 전) + 확정(모임 전)인 사람 모임만', () => {
    const bookId = insertBook('하드씽')
    const h1 = insertUser('h1'), h2 = insertUser('h2'), h3 = insertUser('h3'), h4 = insertUser('h4')
    const recruiting = userClub(h1, bookId)
    const expired = userClub(h2, bookId, { recruitUntilIso: '2026-09-01T23:59:59.000Z' })
    const confirmedFuture = userClub(h3, bookId); clubRepo.confirm(confirmedFuture.id, '2026-09-29T09:30:00.000Z')
    const confirmedPast = userClub(h4, bookId); clubRepo.confirm(confirmedPast.id, '2026-09-10T09:30:00.000Z')
    clubRepo.insertProposal({ bookId, matchScore: 0, matchReason: '', agenda: [], members: [{ userId: h1, role: 'host' }], inviteExpiresAt: '2026-09-30T23:59:59.000Z' })
    const ids = clubRepo.listOpen(NOW.toISOString()).map((c) => c.id)
    expect(ids).toContain(recruiting.id); expect(ids).toContain(confirmedFuture.id)
    expect(ids).not.toContain(expired.id); expect(ids).not.toContain(confirmedPast.id)
  })
})
