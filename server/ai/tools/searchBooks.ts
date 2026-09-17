import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { bookRepo } from '../../repositories/bookRepo'
import { loanService } from '../../services/loanService'

const MAX_RESULTS = 8
const SUMMARY_LENGTH = 80

/**
 * 결과가 비었을 때 모델에게 주는 안내. 빈 배열만 주면 모델이 키워드를 바꿔가며 끝없이
 * 다시 검색한다("에세이"→"산문"→"문학"→작가 이름… 15회, 입력 토큰 10만) — 서가에 장르 분류가
 * 없다는 사실과 멈출 지점을 결과에 직접 적어 준다.
 */
function emptyNote(categories: string[], unknownCategory?: string): string {
  const list = categories.join(', ')
  const head = unknownCategory
    ? `"${unknownCategory}"라는 카테고리는 없습니다. 사내 서가 카테고리는 ${list} 뿐입니다(에세이·소설·시 같은 문학 장르 분류는 없음).`
    : `검색 결과가 없습니다. 사내 서가 카테고리는 ${list} 뿐입니다.`
  return (
    `${head} 다른 키워드로 한두 번만 더 찾아보고, 그래도 없으면 더 검색하지 마세요. ` +
    '지금까지 찾은 책 중 요청에 가장 가까운 책을 이유와 함께 제안하고, ' +
    'search_external_books로 외부 도서를 찾아 희망도서 신청을 안내하세요.'
  )
}

export const makeSearchBooks = () => {
  const categories = bookRepo.categories()
  return tool(
    async ({ query, category }) => {
      const unknownCategory = category && !categories.includes(category) ? category : undefined
      if (unknownCategory) {
        return JSON.stringify({ books: [], note: emptyNote(categories, unknownCategory) })
      }
      const books = bookRepo
        .findAll({ query, category, inDescription: true })
        .slice(0, MAX_RESULTS)
        .map((b) => ({
          id: b.id,
          title: b.title,
          author: b.author,
          category: b.category,
          status: loanService.bookStatus(b.id).status,
          summary: (b.description ?? '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_LENGTH),
        }))
      return JSON.stringify(books.length ? { books } : { books, note: emptyNote(categories) })
    },
    {
      name: 'search_books',
      description:
        '사내 서가에서 도서를 검색한다. query는 제목·저자·소개글에서 찾으며(공백으로 나눈 단어 중 하나만 걸려도 나옴), ' +
        '결과에 대출 상태와 소개 요약(summary)을 포함한다. ' +
        `category는 다음 중 하나와 정확히 일치해야 한다: ${categories.join(', ')}. ` +
        '"퇴근길에 가볍게", "위로가 되는"처럼 상황·분위기로 물으면 장르명 대신 분위기 단어(예: "일상 마음 위로 이야기")를 한 번에 넣어 검색하라.',
      schema: z.object({
        query: z.string().optional().describe('제목/저자/소개글에서 찾을 검색어(여러 단어 가능)'),
        category: z.string().optional().describe('카테고리(정확히 일치)'),
      }),
    }
  )
}
