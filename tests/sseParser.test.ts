import { describe, it, expect } from 'vitest'
import { createSseParser } from '../app/utils/sse'

interface Ev { type: string; text?: string }

describe('createSseParser', () => {
  it('완성된 프레임마다 파싱된 이벤트를 돌려준다', () => {
    const parser = createSseParser<Ev>()
    expect(parser.feed('data: {"type":"delta","text":"안"}\n\n')).toEqual([{ type: 'delta', text: '안' }])
  })

  it('한 청크에 여러 프레임이 와도 모두 돌려준다', () => {
    const parser = createSseParser<Ev>()
    const out = parser.feed('data: {"type":"tool"}\n\ndata: {"type":"delta","text":"녕"}\n\n')
    expect(out).toEqual([{ type: 'tool' }, { type: 'delta', text: '녕' }])
  })

  it('프레임이 청크 경계에 걸려도 완성될 때까지 기다린다', () => {
    const parser = createSseParser<Ev>()
    expect(parser.feed('data: {"type":"del')).toEqual([])
    expect(parser.feed('ta","text":"하"}\n\n')).toEqual([{ type: 'delta', text: '하' }])
  })

  it('data 줄이 없는 프레임(주석·핑)은 건너뛴다', () => {
    const parser = createSseParser<Ev>()
    expect(parser.feed(': ping\n\n')).toEqual([])
  })

  it('깨진 JSON은 스트림 전체를 죽이지 않고 조용히 버린다', () => {
    const parser = createSseParser<Ev>()
    expect(parser.feed('data: {oops\n\ndata: {"type":"done"}\n\n')).toEqual([{ type: 'done' }])
  })

  it('event: 줄이 함께 와도 data 줄만 읽는다', () => {
    const parser = createSseParser<Ev>()
    expect(parser.feed('event: message\ndata: {"type":"done"}\n\n')).toEqual([{ type: 'done' }])
  })
})
