import { describe, it, expect } from 'vitest'
import { normalizeActionPath, parseAiAnswer } from '../server/ai/parse'

describe('normalizeActionPath — 모델이 변형해 쓴 경로를 카탈로그 형태로 맞춘다', () => {
  it.each([
    ['/books/12/review', '/books/12?review=1'],
    ['/books/12/reviews', '/books/12?review=1'],
    ['/books/12?review=true', '/books/12?review=1'],
    ['/books/12?review=1', '/books/12?review=1'],
    ['/book/12', '/books/12'],
    ['/books/12/', '/books/12'],
    ['/reviews/', '/reviews'],
    [' /my ', '/my'],
    ['/', '/'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeActionPath(input)).toBe(expected)
  })
})

describe('parseAiAnswer — 넓어진 화이트리스트', () => {
  it('실제 앱 라우트(/reviews, /notices, /)는 통과하고 관리자·외부 URL은 여전히 드랍한다', () => {
    const text =
      '{"message":"m","bookIds":[],"actions":[' +
      '{"type":"navigate","label":"리뷰","to":"/reviews"},' +
      '{"type":"navigate","label":"공지","to":"/notices"},' +
      '{"type":"navigate","label":"홈","to":"/"},' +
      '{"type":"navigate","label":"관리자","to":"/admin/qa"},' +
      '{"type":"navigate","label":"외부","to":"https://example.com"},' +
      '{"type":"navigate","label":"리뷰쓰기","to":"/books/3/review"}' +
      ']}'
    expect(parseAiAnswer(text).actions.map((a) => (a.type === 'navigate' ? a.to : ''))).toEqual([
      '/reviews',
      '/notices',
      '/',
      '/books/3?review=1',
    ])
  })
})
