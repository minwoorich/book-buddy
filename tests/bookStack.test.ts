import { describe, it, expect } from 'vitest'
import { MAX_STACK, layoutStack, spineColor, type StackBook } from '../shared/utils/bookStack'

function book(id: number, title: string): StackBook {
  return { id, title }
}

/** 신고된 화면에 실제로 있던 제목들 — 긴 제목이 문제의 핵심이다. */
const REAL: StackBook[] = [
  book(1, '처음부터 시작하는 주식투자 단타전략'),
  book(2, '나를 발견하는 인류학 수업'),
  book(3, '투자에 대한 생각'),
  book(4, '박종훈의 미국주식투자 레시피'),
  book(5, '리팩토링 데이터베이스(위키북스 데이터 & 데이터베이스 시리즈)'),
  book(6, '66일 자존감 대화법'),
  book(7, '파이썬(실무에 바로 적용할 수 있는)'),
]

describe('책 탑 레이아웃', () => {
  it('폭을 비율로 준다 — 어떤 책등도 받침대(=컨테이너)를 넘지 않는다', () => {
    const { spines } = layoutStack(REAL)
    expect(spines.length).toBeGreaterThan(0)
    for (const spine of spines) {
      expect(spine.widthPercent).toBeGreaterThan(0)
      expect(spine.widthPercent).toBeLessThanOrEqual(100)
    }
  })

  it('가장 긴 제목의 책등도 받침대보다 좁다 — 받침대가 밖으로 삐져나오지 않게', () => {
    const { spines } = layoutStack(REAL)
    expect(Math.max(...spines.map((s) => s.widthPercent))).toBeLessThan(100)
  })

  it('컨테이너를 좁혀도(폭 하나만 바뀌어도) 비율은 그대로 — CSS가 통째로 줄일 수 있다', () => {
    const { width, spines } = layoutStack(REAL)
    expect(width).toBeGreaterThan(0)
    // 비율이 곧 레이아웃이므로, 폭을 절반으로 클램프해도 책등 간 상대 크기는 유지된다.
    const pxAtHalf = spines.map((s) => (s.widthPercent / 100) * (width / 2))
    expect(Math.max(...pxAtHalf)).toBeLessThan(width / 2)
  })

  it('최근 완독순으로 최대 9권만 쌓고, 나머지는 +N권으로 센다', () => {
    const many = Array.from({ length: 14 }, (_, i) => book(i + 1, `책 ${i + 1}`))
    const { spines, overflowCount } = layoutStack(many)
    expect(spines).toHaveLength(MAX_STACK)
    expect(overflowCount).toBe(14 - MAX_STACK)
    expect(spines[0]!.book.title).toBe('책 1')
  })

  it('빈 서재에서도 폭이 0이 되지 않는다', () => {
    const { width, spines, overflowCount } = layoutStack([])
    expect(spines).toHaveLength(0)
    expect(overflowCount).toBe(0)
    expect(width).toBeGreaterThan(0)
  })

  it('책등 색은 id로 결정적이다', () => {
    expect(spineColor(7)).toBe(spineColor(7))
    expect(spineColor(7)).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})
