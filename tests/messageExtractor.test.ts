import { describe, it, expect } from 'vitest'
import { createMessageExtractor } from '../server/ai/streamText'

describe('createMessageExtractor', () => {
  it('1. 한 청크에 전체 JSON이 들어와도 message 값만 뽑아낸다', () => {
    const extractor = createMessageExtractor()
    const text = '{"message":"안녕하세요, 반가워요.","bookIds":[1],"actions":[]}'
    expect(extractor.feed(text)).toBe('안녕하세요, 반가워요.')
  })

  it('2. 여러 청크로 쪼개져도(키·이스케이프가 경계에 걸쳐도) 이어붙여 복원한다', () => {
    const extractor = createMessageExtractor()
    // "message" 토큰이 `"mess` / `age"` 로 쪼개지고, \n 이스케이프가 `\\` / `n둘째` 로 쪼개진다.
    const chunks = ['{"mess', 'age":"첫', '줄\\', 'n둘째 줄","bookIds', '":[],"actions":[]}']
    let result = ''
    for (const c of chunks) result += extractor.feed(c)
    expect(result).toBe('첫줄\n둘째 줄')
  })

  it('3. \\n 이스케이프를 실제 개행 문자로 변환한다', () => {
    const extractor = createMessageExtractor()
    const text = '{"message":"1. 책A\\n2. 책B","bookIds":[],"actions":[]}'
    expect(extractor.feed(text)).toBe('1. 책A\n2. 책B')
  })

  it('4. message 필드 이전의 잡담/다른 키 텍스트는 델타로 새지 않는다', () => {
    const extractor = createMessageExtractor()
    const chunks = [
      '물론이죠, 답변드릴게요.\n```json\n{"foo":"bar",',
      '"message":"실제 답변"',
      ',"bookIds":[],"actions":[]}',
    ]
    let result = ''
    for (const c of chunks) result += extractor.feed(c)
    expect(result).toBe('실제 답변')
  })
})
