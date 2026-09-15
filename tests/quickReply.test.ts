import { describe, it, expect } from 'vitest'
import { ensureQuickReplies, DEFAULT_QUICK_REPLIES } from '../app/utils/quickReply'
import type { ChatAction } from '../shared/types'

describe('ensureQuickReplies (QA #57)', () => {
  it('확인 질문인데 reply 버튼이 없으면 네/아니오를 덧붙인다', () => {
    const nav: ChatAction = { type: 'navigate', label: '내 서재', to: '/my' }
    const result = ensureQuickReplies('『팀장의 탄생』을 대출할까요?', [nav])
    expect(result).toEqual([nav, ...DEFAULT_QUICK_REPLIES])
  })

  it('이미 reply 버튼이 있으면 그대로 둔다', () => {
    const replies: ChatAction[] = [{ type: 'reply', label: '응', send: '응' }]
    expect(ensureQuickReplies('예약할까요?', replies)).toBe(replies)
  })

  it('확인 질문이 아니면 아무것도 덧붙이지 않는다', () => {
    expect(ensureQuickReplies('리더십 책 세 권을 골라봤어요.', undefined)).toEqual([])
    expect(ensureQuickReplies('어떤 분야가 궁금하세요?', [])).toEqual([])
  })
})
