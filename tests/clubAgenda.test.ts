import { describe, it, expect } from 'vitest'
import { buildAgendaPrompt, parseAgenda, fallbackAgenda, type AgendaReview } from '../server/ai/clubAgenda'

const REVIEWS: AgendaReview[] = [
  { userId: 1, userName: '김독서', rating: 5, content: '위기의 순간마다 꺼내 볼 책이다.' },
  { userId: 2, userName: '이완독', rating: 2, content: '실리콘밸리 얘기라 우리 현장과는 거리가 멀었다.' },
]

describe('buildAgendaPrompt', () => {
  it('참가자 이름·별점·리뷰 원문을 프롬프트에 담는다', () => {
    const prompt = buildAgendaPrompt('하드씽', REVIEWS)
    expect(prompt).toContain('하드씽')
    expect(prompt).toContain('김독서')
    expect(prompt).toContain('5점')
    expect(prompt).toContain('실리콘밸리 얘기라')
  })

  it('리뷰가 없으면 리뷰 없음을 명시한다', () => {
    expect(buildAgendaPrompt('하드씽', [])).toContain('리뷰가 없')
  })
})

describe('parseAgenda', () => {
  it('모델이 준 JSON을 아젠다로 바꾸고 근거에 이름을 채운다', () => {
    const raw = JSON.stringify({
      questions: [{ question: '저자의 결론이 우리 현장에서도 통할까요?', evidenceUserIds: [1, 2] }],
    })
    const items = parseAgenda(raw, REVIEWS)

    expect(items).toHaveLength(1)
    expect(items[0]?.question).toContain('통할까요')
    expect(items[0]?.evidence.map((e) => e.userName)).toEqual(['김독서', '이완독'])
    expect(items[0]?.evidence[0]?.quote).toContain('위기의 순간')
  })

  it('코드펜스로 감싼 JSON도 읽는다', () => {
    const raw = '```json\n{"questions":[{"question":"질문","evidenceUserIds":[]}]}\n```'
    expect(parseAgenda(raw, REVIEWS)).toHaveLength(1)
  })

  it('모르는 userId는 근거에서 버린다', () => {
    const raw = JSON.stringify({ questions: [{ question: '질문', evidenceUserIds: [1, 999] }] })
    expect(parseAgenda(raw, REVIEWS)[0]?.evidence).toHaveLength(1)
  })

  it('JSON이 깨졌으면 빈 배열', () => {
    expect(parseAgenda('그냥 문장입니다', REVIEWS)).toEqual([])
  })

  it('질문이 빈 문자열인 항목은 버린다', () => {
    const raw = JSON.stringify({ questions: [{ question: '   ', evidenceUserIds: [] }, { question: '좋은 질문', evidenceUserIds: [] }] })
    expect(parseAgenda(raw, REVIEWS)).toHaveLength(1)
  })

  it('5개를 넘으면 앞 5개만 쓴다', () => {
    const raw = JSON.stringify({
      questions: Array.from({ length: 8 }, (_, i) => ({ question: `질문 ${i}`, evidenceUserIds: [] })),
    })
    expect(parseAgenda(raw, REVIEWS)).toHaveLength(5)
  })
})

describe('fallbackAgenda', () => {
  it('리뷰가 없을 때 쓸 일반 질문을 주고, 근거는 비어 있다', () => {
    const items = fallbackAgenda('하드씽')
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items.every((i) => i.evidence.length === 0)).toBe(true)
    expect(items[0]?.question).toContain('하드씽')
  })
})
