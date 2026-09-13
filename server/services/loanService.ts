import { bookRepo } from '../repositories/bookRepo'
import { loanRepo } from '../repositories/loanRepo'
import { reservationRepo } from '../repositories/reservationRepo'
import { ApiError } from '../utils/errors'
import type { Loan, Reservation } from '../../shared/types'

const LOAN_PERIOD_MS = 14 * 86400_000

export const loanService = {
  borrow(userId: number, bookId: number): Loan {
    const book = bookRepo.findById(bookId)
    if (!book) throw new ApiError(404, '없는 책이에요')
    if (loanRepo.activeByBook(bookId)) throw new ApiError(409, '이미 대출 중인 책이에요')

    const first = reservationRepo.firstWaiting(bookId)
    if (first && first.userId !== userId) throw new ApiError(409, '예약자가 있는 책이에요')
    if (first) reservationRepo.updateStatus(first.id, 'fulfilled')

    const dueAt = new Date(Date.now() + LOAN_PERIOD_MS).toISOString()
    return loanRepo.findById(loanRepo.insert(bookId, userId, dueAt))!
  },

  return_(userId: number, loanId: number, opts?: { asAdmin?: boolean }): Loan {
    const loan = loanRepo.findById(loanId)
    if (!loan) throw new ApiError(404, '없는 대출이에요')
    if (loan.userId !== userId && !opts?.asAdmin) throw new ApiError(403, '본인의 대출만 반납할 수 있어요')
    if (loan.returnedAt) throw new ApiError(409, '이미 반납된 대출이에요')

    loanRepo.markReturned(loanId)
    return loanRepo.findById(loanId)!
  },

  reserve(userId: number, bookId: number): Reservation {
    const active = loanRepo.activeByBook(bookId)
    if (!active) throw new ApiError(409, '대출 가능한 책은 바로 대출하세요')
    if (active.userId === userId) throw new ApiError(409, '본인이 대출 중인 책이에요')

    const alreadyReserved = reservationRepo.waitingByUser(userId).some((r) => r.bookId === bookId)
    if (alreadyReserved) throw new ApiError(409, '이미 예약한 책이에요')

    return reservationRepo.findById(reservationRepo.insert(bookId, userId))!
  },

  bookStatus(bookId: number): {
    status: 'available' | 'loaned'
    dueAt?: string
    waitingCount: number
    reservedForUserId?: number
  } {
    const active = loanRepo.activeByBook(bookId)
    const waitingCount = reservationRepo.countWaiting(bookId)

    if (active) {
      return { status: 'loaned', dueAt: active.dueAt, waitingCount }
    }

    const first = reservationRepo.firstWaiting(bookId)
    return {
      status: 'available',
      waitingCount,
      ...(first ? { reservedForUserId: first.userId } : {}),
    }
  },
}
