import { describe, it, expect } from 'vitest'
import { clubTitle } from '../shared/utils/clubTitle'

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
