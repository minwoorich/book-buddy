import { describe, it, expect } from 'vitest'
import { toChatHistory } from '../app/utils/chatHistory'
import type { Book } from '../shared/types'

const book = (id: number): Book => ({
  id,
  isbn13: null,
  title: `책 ${id}`,
  author: '저자',
  publisher: null,
  category: '인문',
  description: null,
  coverUrl: null,
  pubDate: null,
  pageCount: null,
})

describe('toChatHistory — assistant 턴을 모델이 냈던 JSON 형태로 되돌려 보낸다', () => {
  it('user 턴은 그대로, assistant 턴은 message/bookIds/actions JSON 문자열로', () => {
    const history = toChatHistory([
      { role: 'user', content: '하드씽 대출해줘' },
      {
        role: 'assistant',
        content: '대출할까요?',
        books: [book(574)],
        actions: [{ type: 'reply', label: '네', send: '네' }],
      },
      { role: 'assistant', content: '평문' },
    ])
    expect(history[0]).toEqual({ role: 'user', content: '하드씽 대출해줘' })
    expect(JSON.parse(history[1].content)).toEqual({
      message: '대출할까요?',
      bookIds: [574],
      actions: [{ type: 'reply', label: '네', send: '네' }],
    })
    expect(JSON.parse(history[2].content)).toEqual({ message: '평문', bookIds: [], actions: [] })
  })
})
