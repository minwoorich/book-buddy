import { describe, it, expect } from 'vitest'
import { enrichAnswer, recentBookIdsFromHistory, DEFAULT_QUICK_REPLIES } from '../server/ai/enrich'
import type { AiAnswer } from '../shared/types'

function answer(message: string, extra: Partial<AiAnswer> = {}): AiAnswer {
  return { message, bookIds: [], actions: [], ...extra }
}

describe('enrichAnswer — 모델이 버튼을 빠뜨린 답변 보정', () => {
  it('재현 케이스: 평문 "리뷰 작성 페이지로 이동해드릴게요. 아래 버튼을 눌러주세요!" + 문맥 책 → 리뷰 쓰기 버튼', () => {
    const out = enrichAnswer(answer('『하드씽』 리뷰 작성 페이지로 이동해드릴게요. 아래 버튼을 눌러주세요!'), {
      recentBookIds: [574],
    })
    expect(out.actions).toEqual([{ type: 'navigate', label: '리뷰 쓰러 가기', to: '/books/574?review=1' }])
  })

  it('이번 답변의 bookIds가 문맥 책보다 우선한다', () => {
    const out = enrichAnswer(answer('리뷰를 남겨보세요.', { bookIds: [7] }), { recentBookIds: [574] })
    expect(out.actions[0]).toEqual({ type: 'navigate', label: '리뷰 쓰러 가기', to: '/books/7?review=1' })
  })

  it('문맥 책이 없으면 책 관련 버튼은 만들지 않는다', () => {
    const out = enrichAnswer(answer('리뷰 작성 페이지로 이동해드릴게요. 아래 버튼을 눌러주세요!'), { recentBookIds: [] })
    expect(out.actions).toEqual([])
  })

  it('페이지 키워드로 목적지를 채운다 (내 서재·랭킹·공지) — 달력은 내 서재로 합쳐져 /my 하나로 묶인다', () => {
    const out = enrichAnswer(answer('내 서재에서 반납일을 확인하세요. 랭킹도 오르셨어요! 공지도 보세요.'), { recentBookIds: [] })
    expect(out.actions.map((a) => (a.type === 'navigate' ? a.to : ''))).toEqual(['/my', '/rankings', '/notices'])
  })

  it('이미 같은 목적지 버튼이 있으면 중복 추가하지 않고, 기존 버튼 순서를 유지한다', () => {
    const existing: AiAnswer = answer('내 서재에서 확인해보세요.', {
      actions: [{ type: 'navigate', label: '내 서재 가기', to: '/my' }],
    })
    const out = enrichAnswer(existing, { recentBookIds: [] })
    expect(out.actions).toEqual([{ type: 'navigate', label: '내 서재 가기', to: '/my' }])
  })

  it('확인 질문에는 네/아니오 퀵리플라이를 붙이고, 이미 reply가 있으면 건드리지 않는다', () => {
    expect(enrichAnswer(answer('『하드씽』을 대출할까요?'), { recentBookIds: [] }).actions).toEqual(DEFAULT_QUICK_REPLIES)
    const withReply = answer('대출할까요?', { actions: [{ type: 'reply', label: '응', send: '응' }] })
    expect(enrichAnswer(withReply, { recentBookIds: [] }).actions).toHaveLength(1)
  })

  it('분야를 묻는 질문에는 카테고리 칩 4개를 붙인다', () => {
    const out = enrichAnswer(answer('어떤 분야의 책을 찾으세요?'), { recentBookIds: [] })
    expect(out.actions.map((a) => a.label)).toEqual(['경제경영', 'IT', '자기계발', '인문'])
    expect(out.actions[0]).toMatchObject({ type: 'reply', send: '경제경영 분야로 추천해줘' })
  })

  it('"버튼"을 약속했지만 목적지를 못 찾으면 문맥 책 상세로 이어준다', () => {
    const out = enrichAnswer(answer('아래 버튼을 눌러주세요!'), { recentBookIds: [12] })
    expect(out.actions).toEqual([{ type: 'navigate', label: '책 상세 보기', to: '/books/12' }])
  })

  it('navigate는 최대 3개까지만 둔다', () => {
    const out = enrichAnswer(answer('내 서재, 캘린더, 랭킹, 피드, 공지까지 모두 확인해보세요.'), { recentBookIds: [] })
    expect(out.actions.filter((a) => a.type === 'navigate')).toHaveLength(3)
  })

  it('원본 answer를 변경하지 않는다', () => {
    const src = answer('내 서재를 확인하세요.')
    enrichAnswer(src, { recentBookIds: [] })
    expect(src.actions).toEqual([])
  })
})

describe('recentBookIdsFromHistory', () => {
  it('assistant JSON 턴에서 bookIds를 최신순·중복 없이 모으고 평문 턴은 건너뛴다', () => {
    const ids = recentBookIdsFromHistory([
      { role: 'assistant', content: '{"message":"a","bookIds":[1,2],"actions":[]}' },
      { role: 'user', content: '응' },
      { role: 'assistant', content: '평문 답변' },
      { role: 'assistant', content: '{"message":"b","bookIds":[2,3],"actions":[]}' },
      { role: 'user', content: '리뷰 달고 싶어' },
    ])
    expect(ids).toEqual([2, 3, 1])
  })

  it('깨진 JSON은 무시한다', () => {
    expect(recentBookIdsFromHistory([{ role: 'assistant', content: '{"bookIds":[1' }])).toEqual([])
  })
})
