import { describe, it, expect } from 'vitest'
import { clubTitle, josa } from '../shared/utils/clubTitle'

describe('clubTitle', () => {
  it('에이전트 모임은 『책』 책모임', () => {
    expect(clubTitle({ origin: 'agent', title: null, bookTitle: '하드씽' })).toBe('『하드씽』 책모임')
  })
  it('사람 모임은 제목', () => {
    expect(clubTitle({ origin: 'user', title: '하드씽 같이 읽어요', bookTitle: '하드씽' })).toBe('하드씽 같이 읽어요')
  })
  it('사람 모임인데 제목이 비어 있으면 『책』 책모임으로 폴백', () => {
    expect(clubTitle({ origin: 'user', title: '  ', bookTitle: '하드씽' })).toBe('『하드씽』 책모임')
  })
})

describe('josa', () => {
  it('받침 있는 한글 뒤엔 withFinal', () => {
    expect(josa('책모임', '이', '가')).toBe('이')
  })
  it('받침 없는 한글 뒤엔 withoutFinal', () => {
    expect(josa('함께 읽기', '이', '가')).toBe('가')
  })
  it('영문 뒤엔 받침 없는 쪽', () => {
    expect(josa('ABC', '을', '를')).toBe('를')
  })
  it('닫는 괄호 등 기호 뒤에도 마지막 글자 기준으로 판단한다', () => {
    expect(josa('『하드씽』 책모임', '을', '를')).toBe('을')
  })
})
