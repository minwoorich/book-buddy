import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'

beforeEach(() => { initDb(':memory:') })

describe('bookRepo', () => {
  it('insert 후 findAll/findById/검색이 동작한다', () => {
    const id = bookRepo.insert({ isbn13: '9791165210748', title: '팀장의 탄생', author: '줄리 주오',
      publisher: '더퀘스트', category: '경제경영', description: 'd', coverUrl: 'c', pubDate: '2020-05-01', pageCount: 344 })
    expect(bookRepo.findById(id)?.title).toBe('팀장의 탄생')
    expect(bookRepo.findAll({ query: '팀장' })).toHaveLength(1)
    expect(bookRepo.findAll({ query: '없는책' })).toHaveLength(0)
  })
})
