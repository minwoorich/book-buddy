import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '../server/db/connection'
import { bookRepo } from '../server/repositories/bookRepo'

/** 검색어를 공백으로 쪼개 단어마다 매칭하는 동작(제목/저자 OR + 매칭 수 정렬). */

beforeEach(() => {
  initDb(':memory:')
  const seed = (title: string, author: string) =>
    bookRepo.insert({ isbn13: null, title, author, publisher: null, category: '컴퓨터',
      description: null, coverUrl: null, pubDate: null, pageCount: null })
  seed('혼자 공부하는 파이썬', '윤인성')
  seed('경제학 입문', '김경제')
  seed('파이썬 입문 노트', '박파이')
  seed('마케팅 불변의 법칙', '알 리스')
})

describe('bookRepo.findAll 다중 키워드 검색', () => {
  it('공백으로 나눈 단어 중 하나만 맞아도 결과에 나온다', () => {
    const titles = bookRepo.findAll({ query: '파이썬 입문' }).map((b) => b.title)
    expect(titles).toContain('혼자 공부하는 파이썬')
    expect(titles).toContain('경제학 입문')
    expect(titles).toContain('파이썬 입문 노트')
    expect(titles).not.toContain('마케팅 불변의 법칙')
  })

  it('맞은 단어가 많은 책이 앞에 온다', () => {
    const titles = bookRepo.findAll({ query: '파이썬 입문' }).map((b) => b.title)
    expect(titles).toHaveLength(3)
    expect(titles[0]).toBe('파이썬 입문 노트')
  })

  it('제목과 저자에 단어가 나뉘어 걸려도 찾는다', () => {
    const titles = bookRepo.findAll({ query: '윤인성 노트' }).map((b) => b.title)
    expect(titles).toContain('혼자 공부하는 파이썬')
    expect(titles).toContain('파이썬 입문 노트')
  })

  it('단어 사이 공백이 여러 칸이어도 빈 단어로 전체 매칭되지 않는다', () => {
    const titles = bookRepo.findAll({ query: '파이썬   ' }).map((b) => b.title)
    expect(titles).not.toContain('마케팅 불변의 법칙')
    expect(titles).toHaveLength(2)
  })
})
