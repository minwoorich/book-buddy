import { describe, expect, it } from 'vitest'
import { bookIdsFromTools } from '../server/ai/bookMention'

/**
 * 답변 본문에 제목이 나왔는데 bookIds가 비어 오는 경우를 도구 결과로 되살린다.
 *
 * 재현(운영): 모델이 도구를 부르는 중간 턴에 추천 본문을 써 버리면, 스트리밍은 마지막 턴만
 * 최종 답으로 쓰기 때문에 그 턴의 bookIds가 통째로 사라진다 — 채팅에 책 카드가 안 뜬다.
 * 장소 근거(placeEvidence)와 같은 결: 모델의 말이 아니라 도구가 돌려준 값만 근거로 삼는다.
 */

const search = (books: { id: number; title: string }[]) => ({
  name: 'search_books',
  content: JSON.stringify({ books }),
})

describe('bookIdsFromTools', () => {
  it('본문에 제목이 나온 책만 되살린다', () => {
    const tools = [search([{ id: 11, title: '우울한 마음도 습관입니다' }, { id: 22, title: '클린 코드' }])]
    expect(bookIdsFromTools(tools, '1. 우울한 마음도 습관입니다 — 퇴근길에 좋아요')).toEqual([11])
  })

  it('get_book_detail처럼 단일 객체로 온 결과도 읽는다', () => {
    const tools = [{ name: 'get_book_detail', content: JSON.stringify({ id: 849, title: '사피엔스' }) }]
    expect(bookIdsFromTools(tools, '『사피엔스』를 추천드려요')).toEqual([849])
  })

  it('본문에 언급이 없으면 아무것도 되살리지 않는다', () => {
    const tools = [search([{ id: 11, title: '클린 코드' }])]
    expect(bookIdsFromTools(tools, '조건에 맞는 책을 찾지 못했어요')).toEqual([])
  })

  it('본문에 나온 순서대로, 중복 없이 돌려준다', () => {
    const tools = [
      search([{ id: 11, title: '클린 코드' }, { id: 22, title: '사피엔스' }]),
      search([{ id: 22, title: '사피엔스' }]),
    ]
    expect(bookIdsFromTools(tools, '사피엔스와 클린 코드, 그리고 다시 사피엔스')).toEqual([22, 11])
  })

  it('제목 표기의 사이 공백·괄호 차이는 같은 책으로 본다', () => {
    const tools = [search([{ id: 30, title: '설득의 심리학 1(20주년 기념 개정증보판)' }])]
    expect(bookIdsFromTools(tools, '설득의 심리학 1 을 추천해요')).toEqual([30])
  })

  it('장소 도구 결과나 깨진 JSON은 조용히 건너뛴다', () => {
    const tools = [
      { name: 'search_reading_places', content: JSON.stringify({ places: [{ id: 5, title: '카페' }] }) },
      { name: 'search_books', content: '{깨진 JSON' },
    ]
    expect(bookIdsFromTools(tools, '카페 어때요')).toEqual([])
  })

  it('너무 많이 걸려도 6권까지만 돌려준다', () => {
    const books = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, title: `책 ${i + 1}` }))
    const message = books.map((b) => b.title).join(', ')
    expect(bookIdsFromTools([search(books)], message)).toHaveLength(6)
  })
})
