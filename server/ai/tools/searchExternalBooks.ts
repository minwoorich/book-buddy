import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { bookRepo } from '../../repositories/bookRepo'
import { kakaoBookService } from '../../services/kakaoBookService'

/**
 * 카카오 책 검색 키를 클로저로 받는다(전역 env 직접 참조 금지 — kakaoBookService.ts 주석 참고).
 * 키가 비어 있으면(.env 미설정 등) 사용 불가 메시지를 반환하고 실제 호출은 하지 않는다.
 */
export const makeSearchExternalBooks = (kakaoRestKey: string) =>
  tool(
    async ({ query }) => {
      if (!kakaoRestKey) {
        return JSON.stringify({ message: '희망도서 검색을 지금은 사용할 수 없어요' })
      }
      try {
        const items = await kakaoBookService.search(kakaoRestKey, query)
        return JSON.stringify(
          items.slice(0, 8).map((i) => {
            const owned = i.isbn13 ? bookRepo.findByIsbn13(i.isbn13) : undefined
            return {
              title: i.title,
              author: i.author,
              publisher: i.publisher,
              pubDate: i.pubDate,
              isbn13: i.isbn13,
              inLibrary: Boolean(owned),
              libraryBookId: owned ? owned.id : null,
            }
          })
        )
      } catch {
        return JSON.stringify({ message: '희망도서 검색 중 오류가 발생했어요' })
      }
    },
    {
      name: 'search_external_books',
      description:
        '사내에 없는 책을 외부 서점(카카오 책 검색)에서 찾는다 (희망도서 신청용). ' +
        '결과에는 사내 보유 여부가 포함된다. 보유면 그 책 id로 안내하라.',
      schema: z.object({ query: z.string().describe('검색어(제목/저자 키워드)') }),
    }
  )
