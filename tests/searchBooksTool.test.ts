import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'
import { makeSearchBooks } from '../server/ai/tools/searchBooks'

/**
 * 책벗의 사내 서가 검색 도구. "퇴근길에 가볍게 읽을 에세이"처럼 장르·분위기로 물으면
 * 제목/저자만 보는 검색은 빈 배열만 돌려줘, 모델이 키워드를 바꿔가며 15번 넘게 헛돌았다.
 */

interface SearchResult {
  books: { id: number; title: string; category: string; summary: string }[]
  note?: string
}

beforeEach(() => {
  initDb(':memory:')
  const seed = (title: string, author: string, category: string, description: string | null) =>
    bookRepo.insert({ isbn13: null, title, author, publisher: null, category, description, coverUrl: null, pubDate: null, pageCount: null })
  seed('속담 인류학', '요네하라 마리', '인문', '<고단샤 에세이상>을 수상한 에세이스트의 유쾌한 속담 이야기')
  seed('에세이 쓰는 법', '김작가', '자기계발', '글쓰기 입문서')
  seed('혼자 공부하는 파이썬', '윤인성', 'IT · 프로그래밍', '파이썬 입문서')
})

const run = async (args: { query?: string; category?: string }) =>
  JSON.parse(await makeSearchBooks().invoke(args)) as SearchResult

describe('search_books 도구', () => {
  it('소개글에 걸린 책도 찾되, 제목·저자에 걸린 책을 앞에 둔다', async () => {
    const { books } = await run({ query: '에세이' })
    expect(books.map((b) => b.title)).toEqual(['에세이 쓰는 법', '속담 인류학'])
  })

  it('책마다 소개 요약을 함께 돌려준다', async () => {
    const { books } = await run({ query: '속담' })
    expect(books[0].summary).toContain('에세이스트')
  })

  it('없는 카테고리면 빈 결과 대신 실제 카테고리 목록과 안내를 준다', async () => {
    const res = await run({ category: '에세이' })
    expect(res.books).toEqual([])
    expect(res.note).toContain('인문')
    expect(res.note).toContain('IT · 프로그래밍')
  })

  it('결과가 없으면 더 찾지 말고 대안을 제시하라는 안내를 붙인다', async () => {
    const res = await run({ query: '산문집' })
    expect(res.books).toEqual([])
    expect(res.note).toContain('search_external_books')
  })

  it('결과가 있으면 안내를 붙이지 않는다', async () => {
    const res = await run({ query: '파이썬', category: 'IT · 프로그래밍' })
    expect(res.books).toHaveLength(1)
    expect(res.note).toBeUndefined()
  })

  it('도구 설명에 실제 카테고리 목록이 들어간다', () => {
    expect(makeSearchBooks().description).toContain('인문')
    expect(makeSearchBooks().description).toContain('IT · 프로그래밍')
  })
})
