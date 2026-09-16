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

  it('5. 모델이 JSON 없이 평문으로만 답한 턴도 그대로 델타로 흘린다', () => {
    const extractor = createMessageExtractor()
    const plain =
      '안녕하세요! 지금 대출 중인 책은 없으시네요. 편하게 읽을 만한 책을 찾아드릴까요? 분야를 알려주시면 바로 골라드릴게요.'
    let result = ''
    for (const c of [plain.slice(0, 30), plain.slice(30, 60), plain.slice(60)]) result += extractor.feed(c)
    expect(result).toBe(plain)
  })

  it('6. 평문이 한 청크로 통째로 와도 흘린다', () => {
    const extractor = createMessageExtractor()
    const plain = '지금은 사내 서가에 그 책이 없어서 희망도서로 신청해드릴 수 있어요. 신청해드릴까요? 승인까지 보통 2~3일 걸려요.'
    expect(extractor.feed(plain)).toBe(plain)
  })

  it('7. 짧은 평문 뒤에 JSON이 이어지는 경우엔 평문이 새지 않는다(4번과 같은 보장)', () => {
    const extractor = createMessageExtractor()
    let result = ''
    for (const c of ['잠시만요.\n{"message":"', '찾았어요","bookIds":[],"actions":[]}']) result += extractor.feed(c)
    expect(result).toBe('찾았어요')
  })
})
