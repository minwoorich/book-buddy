import { describe, it, expect } from 'vitest'
import { parsePlaceRanking } from '../server/ai/parse'

describe('parsePlaceRanking', () => {
  it('1. 정상 {"ranked":[...]} JSON을 그대로 파싱한다', () => {
    const text = '{"ranked":[{"name":"카페 온점","reason":"창가 자리가 좋아요."},{"name":"수지도서관","reason":"조용해요."}]}'
    const result = parsePlaceRanking(text)
    expect(result).toEqual([
      { name: '카페 온점', reason: '창가 자리가 좋아요.' },
      { name: '수지도서관', reason: '조용해요.' },
    ])
  })

  it('2. 코드펜스로 감싼 JSON도 파싱한다', () => {
    const text = ['```json', '{"ranked":[{"name":"동천 공원","reason":"산책하기 좋아요."}]}', '```'].join('\n')
    const result = parsePlaceRanking(text)
    expect(result).toEqual([{ name: '동천 공원', reason: '산책하기 좋아요.' }])
  })

  it('3. 앞뒤에 잡담이 섞인 JSON도 첫 균형 블록을 찾아 파싱한다', () => {
    const text =
      '네, 순서를 정리해봤어요!\n' +
      '{"ranked":[{"name":"북카페 서재","reason":"룸이 있어서 좋아요."}]}\n' +
      '더 필요하시면 말씀해주세요.'
    const result = parsePlaceRanking(text)
    expect(result).toEqual([{ name: '북카페 서재', reason: '룸이 있어서 좋아요.' }])
  })

  it('4. JSON을 전혀 찾을 수 없거나 ranked가 없으면 빈 배열로 폴백한다', () => {
    expect(parsePlaceRanking('죄송해요, 지금은 답변을 드릴 수 없어요.')).toEqual([])
    expect(parsePlaceRanking('{"message":"ranked 필드가 없어요"}')).toEqual([])
    expect(parsePlaceRanking('{"ranked": [1, 2, ] }')).toEqual([])
  })
})
