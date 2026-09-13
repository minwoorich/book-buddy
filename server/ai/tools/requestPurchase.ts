import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { purchaseRequestRepo } from '../../repositories/purchaseRequestRepo'
import { ApiError } from '../../utils/errors'

export const makeRequestPurchase = (userId: number) =>
  tool(
    async ({ title, author, isbn13, coverUrl, reason }) => {
      try {
        const request = purchaseRequestRepo.insert(userId, { title, author, isbn13, coverUrl, reason })
        return JSON.stringify({ ok: true, requestId: request.id })
      } catch (e) {
        if (e instanceof ApiError) return JSON.stringify({ ok: false, error: e.message })
        throw e
      }
    },
    {
      name: 'request_purchase',
      description:
        '사내 서가에 없는 책의 구매(희망도서)를 신청한다. 가능하면 먼저 search_external_books(외부 서점 검색)로 실제 존재하는 책인지 확인하고, 그 결과의 정보로 채워 넣어라.',
      schema: z.object({
        title: z.string().describe('책 제목'),
        author: z.string().optional().describe('저자'),
        isbn13: z.string().optional().describe('ISBN13'),
        coverUrl: z.string().optional().describe('표지 이미지 URL'),
        reason: z.string().optional().describe('신청 사유(사용자가 말한 내용 요약)'),
      }),
    }
  )
