/**
 * "내 서재"의 쌓인 책 탑 기하 — 폭을 **비율(%)**로 내놓는 이유.
 *
 * 원래는 책등마다 제목 길이로 계산한 고정 px를 그대로 인라인 style에 박았다. 데스크톱에선
 * 문제가 없지만 모바일(패널 안쪽 폭 ~280px)에서는 긴 제목 한 권이 210px까지 커져서, 옆의
 * 완독 숫자 블록과 합치면 패널을 넘어갔다. flex 항목은 기본적으로 내용보다 작아지지 않으므로
 * (min-width: auto) 탑이 패널 밖으로 삐져나오고 받침대가 잘려 보였다 — 신고된 증상.
 *
 * 그래서 폭을 두 개로 쪼갠다: 탑 전체의 목표 폭(px) 하나와, 그 안에서 각 책등이 차지하는
 * 비율(%). 목표 폭은 CSS가 `min(목표, 100%)`로 한 번만 클램프하면 되고, 책등은 비율이라
 * 통째로 같이 줄어든다. 좁은 화면에서도 "손으로 쌓은 탑" 모양(길이 차이·흔들림)이 그대로 남는다.
 */

export interface StackBook {
  id: number
  title: string
}

/** my.html 책등 6색 팔레트. 순환은 id % length로 결정적으로 정한다. */
export const SPINE_PALETTE = ['#33465C', '#8A6D3B', '#7A3B47', '#4A4E58', '#37655E', '#5C4A66']

export function spineColor(bookId: number): string {
  return SPINE_PALETTE[bookId % SPINE_PALETTE.length]!
}

/** 최대 9권까지 쌓고 넘치면 "+N권"으로 알린다. */
export const MAX_STACK = 9

const MIN_WIDTH = 72
const MAX_WIDTH = 210
/** 책등 글자(8.5px, 굵게) 한 자 폭 근사 — 한글 기준. 영문·숫자는 조금 좁아 여유가 남는다. */
const CHAR_PX = 8.8
const PAD_PX = 18
/** 받침대는 가장 넓은 책보다 이만큼 더 넓다 — 탑이 받침대 위에 얹힌 것처럼 보이게. */
const BASE_MARGIN_PX = 16
const MIN_BASE_WIDTH = 130

/**
 * 책등 하나의 이상적인 폭(px): 제목이 다 보이는 폭 + 책마다 살짝(±4px) 흔들어 손으로 쌓은 느낌.
 * 위로 갈수록 좁아질 필요는 없다.
 */
export function spineWidth(book: StackBook): number {
  const fit = book.title.length * CHAR_PX + PAD_PX
  const jitter = ((book.id * 7) % 9) - 4
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, fit)) + jitter)
}

export interface StackSpine {
  book: StackBook
  /** 탑(=받침대) 폭에 대한 비율. 받침대 여유분 때문에 항상 100보다 작다. */
  widthPercent: number
  color: string
}

export interface StackLayout {
  /** 탑 전체가 쓰고 싶은 폭(px). CSS에서 `min(width, 100%)`로 클램프한다. */
  width: number
  spines: StackSpine[]
  overflowCount: number
}

/** 넘겨받은 순서(최근 완독순)대로 쌓는다 — 첫 원소가 받침대 바로 위. */
export function layoutStack(books: readonly StackBook[]): StackLayout {
  const stacked = books.slice(0, MAX_STACK)
  const width =
    Math.max(MIN_BASE_WIDTH, ...stacked.map(spineWidth)) + BASE_MARGIN_PX

  return {
    width,
    spines: stacked.map((book) => ({
      book,
      widthPercent: (spineWidth(book) / width) * 100,
      color: spineColor(book.id),
    })),
    overflowCount: Math.max(0, books.length - MAX_STACK),
  }
}
