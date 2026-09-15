import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'
import { loanRepo } from '../server/repositories/loanRepo'
import { reservationRepo } from '../server/repositories/reservationRepo'
import { loanService } from '../server/services/loanService'
import { MAX_ACTIVE_LOANS } from '../shared/constants/loan'

function insertUser(name: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, '컴퍼니', '부서', '팀', '팀원', 'F', 1990)
  return Number(result.lastInsertRowid)
}

let u1: number
let u2: number
let u3: number
let b1: number

beforeEach(() => {
  initDb(':memory:')
  u1 = insertUser('u1')
  u2 = insertUser('u2')
  u3 = insertUser('u3')
  b1 = bookRepo.insert({
    isbn13: '9791165210748',
    title: '테스트북',
    author: '저자',
    publisher: '출판사',
    category: '경제경영',
    description: null,
    coverUrl: null,
    pubDate: null,
    pageCount: null,
  })
})

describe('loanService.borrow', () => {
  it('1. 대출 성공: due_at = 대출일 + 14일, activeByBook 존재', () => {
    const before = Date.now()
    const loan = loanService.borrow(u1, b1)
    const after = Date.now()

    expect(loan.userId).toBe(u1)
    expect(loan.bookId).toBe(b1)
    expect(loan.returnedAt).toBeNull()

    const dueAt = new Date(loan.dueAt).getTime()
    const expectedMin = before + 14 * 86400_000
    const expectedMax = after + 14 * 86400_000
    expect(dueAt).toBeGreaterThanOrEqual(expectedMin - 1000)
    expect(dueAt).toBeLessThanOrEqual(expectedMax + 1000)

    expect(loanRepo.activeByBook(b1)?.id).toBe(loan.id)
  })

  it('2. 이미 대출 중인 책 → borrow가 ApiError 409 throw', () => {
    loanService.borrow(u1, b1)
    expect(() => loanService.borrow(u2, b1)).toThrowError(/이미 대출 중인 책이에요/)
    try {
      loanService.borrow(u2, b1)
    } catch (e: any) {
      expect(e.statusCode).toBe(409)
    }
  })
})

describe(`loanService.borrow — 1인 동시 대출 ${MAX_ACTIVE_LOANS}권 한도(QA #90)`, () => {
  function insertBook(title: string): number {
    return bookRepo.insert({
      isbn13: null,
      title,
      author: '저자',
      publisher: null,
      category: '인문',
      description: null,
      coverUrl: null,
      pubDate: null,
      pageCount: null,
    })
  }

  it(`${MAX_ACTIVE_LOANS}권까지는 대출되고, 그 다음 대출은 409로 막힌다`, () => {
    const books = Array.from({ length: MAX_ACTIVE_LOANS + 1 }, (_, i) => insertBook(`책${i}`))
    for (let i = 0; i < MAX_ACTIVE_LOANS; i++) {
      expect(loanService.borrow(u1, books[i]).bookId).toBe(books[i])
    }

    expect(() => loanService.borrow(u1, books[MAX_ACTIVE_LOANS])).toThrowError(
      new RegExp(`한 번에 ${MAX_ACTIVE_LOANS}권까지`)
    )
    try {
      loanService.borrow(u1, books[MAX_ACTIVE_LOANS])
    } catch (e: any) {
      expect(e.statusCode).toBe(409)
    }
  })

  it('한도는 사람별로 센다 — 다른 사람은 그대로 대출할 수 있다', () => {
    const books = Array.from({ length: MAX_ACTIVE_LOANS + 1 }, (_, i) => insertBook(`책${i}`))
    for (let i = 0; i < MAX_ACTIVE_LOANS; i++) loanService.borrow(u1, books[i])

    expect(loanService.borrow(u2, books[MAX_ACTIVE_LOANS]).userId).toBe(u2)
  })

  it('반납하면 한도가 다시 열린다(반납된 책은 세지 않음)', () => {
    const books = Array.from({ length: MAX_ACTIVE_LOANS + 1 }, (_, i) => insertBook(`책${i}`))
    const loans = []
    for (let i = 0; i < MAX_ACTIVE_LOANS; i++) loans.push(loanService.borrow(u1, books[i]))

    expect(() => loanService.borrow(u1, books[MAX_ACTIVE_LOANS])).toThrowError()
    loanService.return_(u1, loans[0].id)
    expect(loanService.borrow(u1, books[MAX_ACTIVE_LOANS]).userId).toBe(u1)
  })

  it('한도에 걸리면 내 예약이 fulfilled로 소비되지 않는다', () => {
    // u2가 b1을 빌리고 u1이 예약 → u2 반납 → u1은 한도가 차 있어 대출 실패.
    // 이때 예약이 사라져 버리면 다른 사람에게 책을 빼앙기므로 waiting으로 남아야 한다.
    const l = loanService.borrow(u2, b1)
    loanService.reserve(u1, b1)
    loanService.return_(u2, l.id)

    const others = Array.from({ length: MAX_ACTIVE_LOANS }, (_, i) => insertBook(`다른책${i}`))
    for (const bookId of others) loanService.borrow(u1, bookId)

    expect(() => loanService.borrow(u1, b1)).toThrowError(
      new RegExp(`한 번에 ${MAX_ACTIVE_LOANS}권까지`)
    )
    expect(reservationRepo.firstWaiting(b1)?.userId).toBe(u1)
  })
})

describe('loanService.return_', () => {
  it('3. 반납 성공: returned_at 세팅, 이후 다시 대출 가능', () => {
    const loan = loanService.borrow(u1, b1)
    const returned = loanService.return_(u1, loan.id)
    expect(returned.returnedAt).not.toBeNull()
    expect(loanRepo.activeByBook(b1)).toBeUndefined()

    const loan2 = loanService.borrow(u2, b1)
    expect(loan2.userId).toBe(u2)
  })

  it('4. 남의 loan 반납 → 403 (asAdmin이면 허용)', () => {
    const loan = loanService.borrow(u1, b1)
    expect(() => loanService.return_(u2, loan.id)).toThrowError()
    try {
      loanService.return_(u2, loan.id)
    } catch (e: any) {
      expect(e.statusCode).toBe(403)
    }
    const returned = loanService.return_(u2, loan.id, { asAdmin: true })
    expect(returned.returnedAt).not.toBeNull()
  })
})

describe('loanService.returnOrCancel', () => {
  it('대출 직후(30분 이내) 반납 → 기록 삭제(취소), 완독으로 집계되지 않음', () => {
    const loan = loanService.borrow(u1, b1)
    const result = loanService.returnOrCancel(u1, loan.id)
    expect(result.canceled).toBe(true)
    expect(loanRepo.findById(loan.id)).toBeUndefined()
  })

  it('30분이 지난 대출 반납 → 정상 반납(returned_at 세팅)', () => {
    const loan = loanService.borrow(u1, b1)
    // loaned_at을 1시간 전으로 되돌려 창을 벗어나게 만든다.
    getDb()
      .prepare("UPDATE loans SET loaned_at = datetime('now', '-1 hour') WHERE id = ?")
      .run(loan.id)
    const result = loanService.returnOrCancel(u1, loan.id)
    expect(result.canceled).toBe(false)
    expect(result.loan?.returnedAt).not.toBeNull()
  })
})

describe('loanService.reserve', () => {
  it('5. 대출 중이 아닌 책 예약 → 409', () => {
    expect(() => loanService.reserve(u1, b1)).toThrowError(/대출 가능한 책은 바로 대출하세요/)
    try {
      loanService.reserve(u1, b1)
    } catch (e: any) {
      expect(e.statusCode).toBe(409)
    }
  })

  it('6. 본인이 빌린 책 예약 → 409', () => {
    loanService.borrow(u1, b1)
    expect(() => loanService.reserve(u1, b1)).toThrowError(/본인이 대출 중인 책이에요/)
  })

  it('7. 중복 예약(같은 유저, waiting 존재) → 409', () => {
    loanService.borrow(u1, b1)
    loanService.reserve(u2, b1)
    expect(() => loanService.reserve(u2, b1)).toThrowError(/이미 예약한 책이에요/)
  })

  it('8. 예약 흐름: u1 대출 → u2 예약 → u1 반납 → u3 대출 시도 409, u2 대출 성공 + 예약 fulfilled', () => {
    const l = loanService.borrow(u1, b1)
    loanService.reserve(u2, b1)
    loanService.return_(u1, l.id)
    expect(() => loanService.borrow(u3, b1)).toThrowError(/예약자가 있는/)
    const l2 = loanService.borrow(u2, b1)
    expect(l2.userId).toBe(u2)
    expect(reservationRepo.firstWaiting(b1)).toBeUndefined() // fulfilled 처리됨
  })
})

describe('loanService.bookStatus', () => {
  it('9. bookStatus: 대출중이면 { status: "loaned", waitingCount }', () => {
    const loan = loanService.borrow(u1, b1)
    loanService.reserve(u2, b1)

    const status = loanService.bookStatus(b1)
    expect(status.status).toBe('loaned')
    expect(status.dueAt).toBe(loan.dueAt)
    expect(status.waitingCount).toBe(1)
  })
})
