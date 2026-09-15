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
 * 피라미드 쌓기(QA #77): 받침대 바로 위 책이 가장 넓고 위로 갈수록 좁아진다.
 * 폭은 층(level)으로만 정하고 책마다 살짝(±3px) 흔들어 손으로 쌓은 느낌을 낸다.
 * 최대 9권까지만 쌓고 넘치면 "+N권"으로 알린다 — 그 이상은 피라미드가 너무 높고 좁아진다.
 */
const MAX_STACK = 9
const BASE_WIDTH = 150
const TOP_WIDTH = 62

/** 최근 완독순(반납일 desc). 아래(첫 원소)가 가장 넓다. */
const recentDone = computed(() =>
  [...props.doneLoans].sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
)
const stacked = computed(() => recentDone.value.slice(0, MAX_STACK))
const overflowCount = computed(() => Math.max(0, recentDone.value.length - MAX_STACK))

function spineWidth(level: number, bookId: number): number {
  const steps = Math.max(1, stacked.value.length - 1)
  const w = BASE_WIDTH - ((BASE_WIDTH - TOP_WIDTH) * level) / steps
  return Math.round(w + ((bookId * 7) % 7) - 3)
}

/** 좁은 책(<90px)에는 제목 대신 짧은 앞글자만 — 긴 제목이 잘려 흉하게 보이지 않게. */
function spineLabel(title: string, width: number): string {
  if (width >= 120) return title
  if (width >= 90) return title.length > 8 ? `${title.slice(0, 8)}…` : title
  return title.length > 4 ? `${title.slice(0, 4)}…` : title
}

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
      <div class="stack-base" />
      <div
        v-for="(loan, level) in stacked"
        :key="loan.id"
        class="spine"
        :style="{ width: `${spineWidth(level, loan.book.id)}px`, background: spineColor(loan.book.id) }"
        :title="loan.book.title"
      >{{ spineLabel(loan.book.title, spineWidth(level, loan.book.id)) }}</div>
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
.stack-base { width: 164px; height: 8px; background: linear-gradient(180deg, var(--shelf-a), var(--shelf-b)); border-radius: 2px; margin-bottom: 4px; box-shadow: 0 6px 10px -6px rgba(84,70,45,.45); }
.more { font-size: 11px; font-weight: 700; color: var(--sub); margin-bottom: 3px; }

@media (max-width: 900px) {
  .stack-widget { margin-left: 0; flex-basis: 100%; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 12px; }
  .stack-nums { text-align: left; }
  .stack-nums b { font-size: 20px; }
  .stack-base { width: 164px; }
}
</style>
