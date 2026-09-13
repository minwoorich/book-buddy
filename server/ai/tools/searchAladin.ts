import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { aladinService } from '../../services/aladinService'

/**
 * 알라딘 Open API 키를 클로저로 받는다(전역 env 직접 참조 금지 — aladinService.ts 주석 참고).
 * 키가 비어 있으면(.env 미설정 등) 사용 불가 메시지를 반환하고 실제 호출은 하지 않는다.
 */
export const makeSearchAladin = (aladinTtbKey: string) =>
  tool(
    async ({ query }) => {
      if (!aladinTtbKey) {
        return JSON.stringify({ message: '희망도서 검색을 지금은 사용할 수 없어요' })
      }
      try {
        const items = await aladinService.search(aladinTtbKey, query)
        return JSON.stringify(
          items.slice(0, 8).map((i) => ({
            title: i.title,
            author: i.author,
            publisher: i.publisher,
            pubDate: i.pubDate,
            isbn13: i.isbn13,
            categoryName: i.categoryName,
          }))
        )
      } catch {
        return JSON.stringify({ message: '희망도서 검색 중 오류가 발생했어요' })
      }
    },
    {
      name: 'search_aladin',
      description:
        '사내 서가에 없는 책을 외부 알라딘 서점에서 검색한다. 희망도서 신청 전 실제 존재 여부/정보 확인용.',
      schema: z.object({ query: z.string().describe('검색어(제목/저자 키워드)') }),
    }
  )
