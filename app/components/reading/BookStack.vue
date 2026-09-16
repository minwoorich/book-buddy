<script setup lang="ts">
import type { Book, Loan } from '#shared/types'
import { layoutStack } from '#shared/utils/bookStack'

const props = defineProps<{
  doneLoans: (Loan & { book: Book })[]
}>()

/** 최근 완독순(반납일 desc). 첫 원소가 받침대 바로 위. */
const recentDone = computed(() =>
  [...props.doneLoans].sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
)

/**
 * 폭 계산은 shared/utils/bookStack으로 뺐다 — 탑 전체 폭(px) 하나와 책등별 비율(%)로 나뉜다.
 * 그래야 좁은 화면에서 CSS가 `min(폭, 100%)` 한 줄로 탑을 통째로 줄일 수 있다.
 */
const stack = computed(() => layoutStack(recentDone.value.map((l) => l.book)))

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
    <div class="bookstack" :style="{ '--stack-w': `${stack.width}px` }">
      <!-- column-reverse라 DOM 첫 요소가 맨 아래에 온다 — 받침대를 먼저 둬야 바닥에 깔린다(QA #76). -->
      <div class="stack-base" />
      <div
        v-for="spine in stack.spines"
        :key="spine.book.id"
        class="spine"
        :style="{ width: `${spine.widthPercent}%`, background: spine.color }"
        :title="spine.book.title"
      >{{ spine.book.title }}</div>
      <span v-if="stack.overflowCount" class="more" :title="`${recentDone.length}권 완독`">
        +{{ stack.overflowCount }}권
      </span>
    </div>
  </div>
</template>

<style scoped>
.stack-widget { margin-left: auto; display: flex; align-items: flex-end; gap: 22px; min-width: 0; }
.stack-nums { text-align: right; }
.stack-nums .eyebrow { display: block; margin-bottom: 6px; }
.stack-nums b { font-family: var(--font-display); font-size: 24px; white-space: nowrap; }
.stack-nums b i { font-style: normal; color: var(--red); }
.stack-nums span { font-size: 12.5px; color: var(--sub); display: block; margin-top: 2px; }

/*
 * 탑이 쓰고 싶은 폭(--stack-w)은 가장 긴 제목에서 나온다. 좁은 화면에선 그 폭이 패널보다
 * 넓어지므로 100%로 잘라낸다 — 책등은 %라 같이 줄어든다. min-width:0 이 없으면 flex 항목이
 * 내용 폭 아래로 줄지 않아(min-width:auto) 잘라내기가 무효가 된다.
 */
.bookstack {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 2px;
  width: min(var(--stack-w), 100%);
  min-width: 0;
  flex-shrink: 1;
}
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
  box-shadow: 0 2px 4px var(--shadow-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  box-sizing: border-box;
}
.stack-base { width: 100%; height: 8px; background: linear-gradient(180deg, var(--shelf-a), var(--shelf-b)); border-radius: 2px; margin-bottom: 4px; box-shadow: 0 6px 10px -6px var(--shadow); }
.more { font-size: 11px; font-weight: 700; color: var(--sub); margin-bottom: 3px; }

@media (max-width: 900px) {
  .stack-widget { margin-left: 0; flex-basis: 100%; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 12px; }
  .stack-nums { text-align: left; }
  .stack-nums b { font-size: 20px; }
}

/*
 * 모바일에선 완독 숫자와 탑이 한 줄을 나눠 가지면 둘 다 좁아진다(숫자는 nowrap이라 안 줄어서
 * 탑만 짓눌렸다). 줄을 나눠 탑에 패널 폭을 통째로 준다 — 제목이 덜 잘린다.
 */
@media (max-width: 640px) {
  .stack-widget { flex-direction: column; align-items: stretch; gap: 14px; }
  .bookstack { align-self: center; }
  .spine { padding: 0 5px; letter-spacing: 0; }
}
</style>
