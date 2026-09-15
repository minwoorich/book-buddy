<script setup lang="ts">
import type { Book, Loan } from '#shared/types'

type LoanWithBook = Loan & { book: Book }

const props = defineProps<{
  year: number
  month: number
  loans: LoanWithBook[]
}>()

function sameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * 42칸(6주 × 7일), 일요일 시작 달력 그리드. `month`는 1~12.
 * 순수 함수 — `year`/`month` 두 정수만으로 결정되고 외부 상태를 참조하지 않는다.
 */
function buildMonthCells(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const start = new Date(year, month - 1, 1 - firstOfMonth.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { date, inMonth: date.getFullYear() === year && date.getMonth() === month - 1 }
  })
}

/** 각 칸에 그 날짜(로컬 연·월·일)로 반납된 loan들을 매칭해 붙인다. */
const cells = computed(() => {
  const base = buildMonthCells(props.year, props.month)
  return base.map((cell) => ({
    ...cell,
    dayLoans: props.loans.filter((l) => l.returnedAt && sameLocalDate(parseDbDate(l.returnedAt), cell.date)),
  }))
})

const today = new Date()
function isToday(d: Date): boolean {
  return sameLocalDate(d, today)
}

// 한 날짜에 완독이 여러 권이면 ‹ › 로 표지를 넘겨본다(QA #47). 키 = 셀 인덱스.
const coverIndex = ref<Record<number, number>>({})
watch(
  () => [props.year, props.month, props.loans] as const,
  () => {
    coverIndex.value = {}
  }
)

function activeLoanOf(cellIdx: number, dayLoans: LoanWithBook[]): LoanWithBook {
  const i = coverIndex.value[cellIdx] ?? 0
  return dayLoans[Math.min(i, dayLoans.length - 1)]!
}

function shiftCover(cellIdx: number, dayLoans: LoanWithBook[], delta: number) {
  const current = coverIndex.value[cellIdx] ?? 0
  const next = (current + delta + dayLoans.length) % dayLoans.length
  coverIndex.value = { ...coverIndex.value, [cellIdx]: next }
}
</script>

<template>
  <div class="cal">
    <div class="dow">
      <span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
    </div>
    <div class="days">
      <div
        v-for="(cell, i) in cells"
        :key="i"
        class="day"
        :class="{ dim: !cell.inMonth, sun: cell.date.getDay() === 0, today: isToday(cell.date) }"
      >
        <span class="n">{{ cell.date.getDate() }}</span>
        <template v-if="cell.dayLoans.length">
          <span class="done">완독</span>
          <NuxtLink class="cv-link" :to="`/books/${activeLoanOf(i, cell.dayLoans).book.id}`">
            <BookCoverImage
              class="hover"
              :src="activeLoanOf(i, cell.dayLoans).book.coverUrl"
              :alt="activeLoanOf(i, cell.dayLoans).book.title"
            />
          </NuxtLink>
          <template v-if="cell.dayLoans.length > 1">
            <button type="button" class="cv-nav prev" aria-label="이전 완독 책" @click.stop="shiftCover(i, cell.dayLoans, -1)">‹</button>
            <button type="button" class="cv-nav next" aria-label="다음 완독 책" @click.stop="shiftCover(i, cell.dayLoans, 1)">›</button>
            <span class="more">{{ (coverIndex[i] ?? 0) + 1 }}/{{ cell.dayLoans.length }}</span>
          </template>
        </template>
      </div>
    </div>
    <div class="legend">
      <span><span class="k" />완독한 책 (반납일 기준)</span>
      <span>표지를 클릭하면 책 상세로 이동</span>
    </div>
  </div>
</template>

<style scoped>
.dow { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 12px; letter-spacing: 1px; color: var(--sub); padding-bottom: 8px; border-bottom: 1px solid var(--line-strong); }
.dow .sun { color: var(--red); }
.days { display: grid; grid-template-columns: repeat(7, 1fr); }
.day { min-height: 132px; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); padding: 8px; position: relative; background: var(--card); }
.day:nth-child(7n) { border-right: 0; }
.day .n { font-size: 12.5px; color: var(--sub); }
.day.dim { background: transparent; }
.day.dim .n { color: #C4BAA6; }
.day.sun .n { color: #C97B72; }
.day.today { outline: 2px solid var(--red); outline-offset: -2px; }
.day.today .n { color: var(--red); font-weight: 800; }
.day .cv-link { display: block; }
.day :deep(.cv) { width: 58px; height: 84px; margin: 7px auto 0; display: block; }
.day .done { position: absolute; top: 7px; right: 7px; font-size: 10px; color: var(--ok); font-weight: 700; }
.day .more { position: absolute; bottom: 6px; right: 7px; font-size: 10px; font-weight: 700; color: var(--sub); background: #EDE7DA; border-radius: 8px; padding: 1px 5px; line-height: 1; }
.day .cv-nav {
  position: absolute; top: 58%; transform: translateY(-50%);
  width: 18px; height: 18px; border-radius: 50%; border: none;
  background: rgba(0, 0, 0, .45); color: #fff; font-size: 12px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
}
.day .cv-nav:hover { background: rgba(0, 0, 0, .65); }
.day .cv-nav.prev { left: 4px; }
.day .cv-nav.next { right: 4px; }
.legend { display: flex; gap: 18px; margin-top: 14px; font-size: 12.5px; color: var(--sub); align-items: center; }
.legend .k { display: inline-block; width: 12px; height: 17px; border-radius: 1px 3px 3px 1px; background: #33465C; box-shadow: 1px 2px 4px rgba(60,48,28,.3); margin-right: 6px; vertical-align: -3px; }
</style>
