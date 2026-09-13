import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'
import { loanRepo } from '../server/repositories/loanRepo'
import { reservationRepo } from '../server/repositories/reservationRepo'
import { loanService } from '../server/services/loanService'

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
