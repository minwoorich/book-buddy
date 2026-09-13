import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { loanRepo } from '../../repositories/loanRepo'

/**
 * userId를 클로저로 갖는 조회 도구. 대출 중 목록 + 최근 반납 완료(최대 10건) +
 * 이달/올해/누적 완독 수(반납 기록 기준)를 함께 반환해 get_my_reading_stats 역할도 겸한다.
 */
export const makeGetMyLoans = (userId: number) =>
  tool(
    async () => {
      const all = loanRepo.findWithBook({ userId })
      const active = all.filter((l) => !l.returnedAt)
      const returned = all
        .filter((l) => l.returnedAt)
        .sort((a, b) => (a.returnedAt! < b.returnedAt! ? 1 : -1))

      const now = new Date()
      const monthPrefix = now.toISOString().slice(0, 7) // YYYY-MM
      const yearPrefix = now.toISOString().slice(0, 4) // YYYY

      return JSON.stringify({
        active: active.map((l) => ({
          loanId: l.id,
          bookId: l.bookId,
          title: l.book.title,
          author: l.book.author,
          dueAt: l.dueAt,
        })),
        recentReturned: returned.slice(0, 10).map((l) => ({
          loanId: l.id,
          bookId: l.bookId,
          title: l.book.title,
          author: l.book.author,
          returnedAt: l.returnedAt,
        })),
        stats: {
          completedThisMonth: returned.filter((l) => l.returnedAt!.startsWith(monthPrefix)).length,
          completedThisYear: returned.filter((l) => l.returnedAt!.startsWith(yearPrefix)).length,
          totalCompleted: returned.length,
        },
      })
    },
    {
      name: 'get_my_loans',
      description:
        '현재 사용자의 대출 현황을 조회한다: 대출 중인 책 목록, 최근 반납 완료 목록(최대 10건), 이달/올해/누적 완독 수.',
      schema: z.object({}),
    }
  )
