<script setup lang="ts">
import type { Book, Loan } from '#shared/types'

const props = defineProps<{
  doneLoans: (Loan & { book: Book })[]
}>()

/** my.html 책등 6색 팔레트. 순환은 book.id % length로 결정적으로 정한다. */
const PALETTE = ['#33465C', '#8A6D3B', '#7A3B47', '#4A4E58', '#37655E', '#5C4A66']

function spineColor(bookId: number): string {
  return PALETTE[bookId % PALETTE.length]
}

/**
 * 자연스러운 쌓기(QA #77 → #82): 책마다 제목이 다 보이는 폭으로 — 폭은 제목 길이에서 나오고
 * 책마다 살짝(±4px) 흔들어 손으로 쌓은 느낌만 낸다. 위로 갈수록 좁아질 필요는 없다.
 * 최대 9권까지 쌓고 넘치면 "+N권"으로 알린다.
 */
const MAX_STACK = 9
const MIN_WIDTH = 72
const MAX_WIDTH = 210
/** 책등 글자(8.5px, 굵게) 한 자 폭 근사 — 한글 기준. 영문·숫자는 조금 좁아 여유가 남는다. */
const CHAR_PX = 8.8
const PAD_PX = 18

/** 최근 완독순(반납일 desc). 첫 원소가 받침대 바로 위. */
const recentDone = computed(() =>
  [...props.doneLoans].sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
)
const stacked = computed(() => recentDone.value.slice(0, MAX_STACK))
const overflowCount = computed(() => Math.max(0, recentDone.value.length - MAX_STACK))

function spineWidth(title: string, bookId: number): number {
  const fit = title.length * CHAR_PX + PAD_PX
  const jitter = ((bookId * 7) % 9) - 4
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, fit)) + jitter)
}

/** 받침대는 가장 넓은 책보다 조금 더 넓게. */
const baseWidth = computed(() =>
  Math.max(130, ...stacked.value.map((l) => spineWidth(l.book.title, l.book.id))) + 16
)

const now = new Date()
const thisYear = now.getFullYear()
const thisMonth = now.getMonth() + 1

function isThisYear(iso: string | null): boolean {
  return !!iso && parseDbDate(iso).getFullYear() === thisYear
}

function isThisMonth(iso: string | null): boolean {
  if (!iso) return false
  const d = parseDbDate(iso)
  return d.getFullYear() === thisYear && d.getMonth() + 1 === thisMonth
}

const yearCount = computed(() => props.doneLoans.filter((l) => isThisYear(l.returnedAt)).length)
const monthCount = computed(() => props.doneLoans.filter((l) => isThisMonth(l.returnedAt)).length)
</script>

<template>
  <div class="stack-widget">
    <div class="stack-nums">
      <span class="eyebrow">{{ thisYear }} READING</span>
      <b>올해 <i>{{ yearCount }}권</i> 완독</b>
      <span>이달 {{ monthCount }}권 · 대출-반납 기록 기준</span>
    </div>
    <div class="bookstack">
      <!-- column-reverse라 DOM 첫 요소가 맨 아래에 온다 — 받침대를 먼저 둬야 바닥에 깔린다(QA #76). -->
      <div class="stack-base" :style="{ width: `${baseWidth}px` }" />
      <div
        v-for="loan in stacked"
        :key="loan.id"
        class="spine"
        :style="{ width: `${spineWidth(loan.book.title, loan.book.id)}px`, background: spineColor(loan.book.id) }"
        :title="loan.book.title"
      >{{ loan.book.title }}</div>
      <span v-if="overflowCount" class="more" :title="`${recentDone.length}권 완독`">+{{ overflowCount }}권</span>
    </div>
  </div>
</template>

<style scoped>
.stack-widget { margin-left: auto; display: flex; align-items: flex-end; gap: 22px; }
.stack-nums { text-align: right; }
.stack-nums .eyebrow { display: block; margin-bottom: 6px; }
.stack-nums b { font-family: var(--font-display); font-size: 24px; white-space: nowrap; }
.stack-nums b i { font-style: normal; color: var(--red); }
.stack-nums span { font-size: 12.5px; color: var(--sub); display: block; margin-top: 2px; }
.bookstack { display: flex; flex-direction: column-reverse; align-items: center; gap: 2px; }
.spine {
  height: 15px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, .92);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .3px;
  box-shadow: 0 2px 4px rgba(60, 48, 28, .25);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  box-sizing: border-box;
}
.stack-base { height: 8px; background: linear-gradient(180deg, var(--shelf-a), var(--shelf-b)); border-radius: 2px; margin-bottom: 4px; box-shadow: 0 6px 10px -6px rgba(84,70,45,.45); }
.more { font-size: 11px; font-weight: 700; color: var(--sub); margin-bottom: 3px; }

@media (max-width: 900px) {
  .stack-widget { margin-left: 0; flex-basis: 100%; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 12px; }
  .stack-nums { text-align: left; }
  .stack-nums b { font-size: 20px; }

}
</style>
