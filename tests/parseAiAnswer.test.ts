import { describe, it, expect } from 'vitest'
import { parseAiAnswer } from '../server/ai/parse'

describe('parseAiAnswer', () => {
  it('1. 정상 JSON을 그대로 파싱한다', () => {
    const text =
      '{"message":"리더십 관련 책을 추천드려요.","bookIds":[3,7],"actions":[{"type":"navigate","label":"상세보기","to":"/books/3"}]}'
    const result = parseAiAnswer(text)
    expect(result).toEqual({
      message: '리더십 관련 책을 추천드려요.',
      bookIds: [3, 7],
      actions: [{ type: 'navigate', label: '상세보기', to: '/books/3' }],
    })
  })

  it('2. 코드펜스로 감싼 JSON도 파싱한다', () => {
    const text = [
      '```json',
      '{"message":"이 책이 좋아요.","bookIds":[1],"actions":[]}',
      '```',
    ].join('\n')
    const result = parseAiAnswer(text)
    expect(result).toEqual({ message: '이 책이 좋아요.', bookIds: [1], actions: [] })
  })

  it('3. 앞뒤에 잡담이 섞인 JSON도 첫 균형 블록을 찾아 파싱한다', () => {
    const text =
      '네, 알겠습니다! 아래가 답변이에요.\n' +
      '{"message":"완독 축하드려요! 이달 2권 읽으셨네요.","bookIds":[],"actions":[{"type":"navigate","label":"내 서재","to":"/my"}]}\n' +
      '도움이 되었길 바라요.'
    const result = parseAiAnswer(text)
    expect(result).toEqual({
      message: '완독 축하드려요! 이달 2권 읽으셨네요.',
      bookIds: [],
      actions: [{ type: 'navigate', label: '내 서재', to: '/my' }],
    })
  })

  it('4. JSON을 전혀 찾을 수 없으면 원문을 message로 담아 폴백한다', () => {
    const text = '죄송해요, 지금은 답변을 드릴 수 없어요.'
    const result = parseAiAnswer(text)
    expect(result).toEqual({ message: text, bookIds: [], actions: [] })
  })

  it('5. JSON처럼 보이지만 파싱 불가능하면 폴백한다', () => {
    const text = '{"message": "안녕하세요", "bookIds": [1, ] }'
    const result = parseAiAnswer(text)
    expect(result).toEqual({ message: text, bookIds: [], actions: [] })
  })

  it('6. message 필드가 없으면 폴백한다', () => {
    const text = '{"bookIds":[1],"actions":[]}'
    const result = parseAiAnswer(text)
    expect(result).toEqual({ message: text, bookIds: [], actions: [] })
  })

  it('7. bookIds/actions 항목 중 형식이 잘못된 것은 걸러낸다', () => {
    const text =
      '{"message":"참고하세요.","bookIds":[1,"x",2,null],"actions":[{"type":"navigate","label":"","to":"/my"},{"type":"other","label":"x","to":"/my"},{"type":"navigate","label":"이동","to":"/rankings"}]}'
    const result = parseAiAnswer(text)
    expect(result).toEqual({
      message: '참고하세요.',
      bookIds: [1, 2],
      actions: [{ type: 'navigate', label: '이동', to: '/rankings' }],
    })
  })

  it('8. 허용된 경로는 통과하고, 화이트리스트에 없는 경로(외부 URL 등)는 드랍한다', () => {
    const text =
      '{"message":"확인해보세요.","bookIds":[],"actions":[' +
      '{"type":"navigate","label":"책 상세","to":"/books/12?review=1"},' +
      '{"type":"navigate","label":"악성 링크","to":"https://evil.example.com"},' +
      '{"type":"navigate","label":"관리자","to":"/admin"},' +
      '{"type":"navigate","label":"내 서재","to":"/my"}' +
      ']}'
    const result = parseAiAnswer(text)
    expect(result).toEqual({
      message: '확인해보세요.',
      bookIds: [],
      actions: [
        { type: 'navigate', label: '책 상세', to: '/books/12?review=1' },
        { type: 'navigate', label: '내 서재', to: '/my' },
      ],
    })
  })
})
