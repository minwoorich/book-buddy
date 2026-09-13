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

/** 84~118px 사이를 book.id 기반으로 결정적으로 변주. */
function spineWidth(bookId: number): number {
  return 84 + ((bookId * 7) % 35)
}

/** 최근 완독순(반납일 desc) 최대 7권. */
const recentDone = computed(() =>
  [...props.doneLoans]
    .sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
    .slice(0, 7)
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
      <div
        v-for="loan in recentDone"
        :key="loan.id"
        class="spine"
        :style="{ width: `${spineWidth(loan.book.id)}px`, background: spineColor(loan.book.id) }"
        :title="loan.book.title"
      >{{ loan.book.title }}</div>
      <div class="stack-base" />
    </div>
  </div>
</template>

<style scoped>
.stack-widget { margin-left: auto; display: flex; align-items: flex-end; gap: 22px; }
.stack-nums { text-align: right; }
.stack-nums .eyebrow { display: block; margin-bottom: 6px; }
.stack-nums b { font-family: "Noto Serif KR", serif; font-size: 24px; }
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
.stack-base { width: 130px; height: 8px; background: linear-gradient(180deg, var(--shelf-a), var(--shelf-b)); border-radius: 2px; margin-top: 4px; }
</style>
