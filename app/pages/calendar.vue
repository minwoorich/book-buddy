<script setup lang="ts">
import type { Book, Loan } from '#shared/types'

type LoanWithBook = Loan & { book: Book }

const api = useApi()
const { user } = useCurrentUser()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1) // 1~12

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function nextYM(y: number, m: number): { y: number; m: number } {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
}

function prevYM(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
}

// from은 해당 월 1일, to는 다음 달 1일 — returned_at(문자열) >= from AND <= to의
// 프리픽스 비교 특성상 "to = 다음 달 1일"은 그 달의 마지막 순간까지만 포함하는
// exclusive 상한처럼 동작한다(타임스탬프가 있는 값은 시각 없는 날짜 문자열보다 항상 더 크다).
const fromDate = computed(() => `${year.value}-${pad2(month.value)}-01`)
const toDate = computed(() => {
  const { y, m } = nextYM(year.value, month.value)
  return `${y}-${pad2(m)}-01`
})

const { data: loans } = await useAsyncData<LoanWithBook[]>(
  'calendar-loans',
  () => {
    if (!user.value) return Promise.resolve([])
    return api<LoanWithBook[]>('/api/loans', {
      query: { returned: true, userId: user.value.id, from: fromDate.value, to: toDate.value },
    })
  },
  { watch: [year, month], default: () => [] }
)

function prevMonth() {
  const { y, m } = prevYM(year.value, month.value)
  year.value = y
  month.value = m
}

function nextMonth() {
  const { y, m } = nextYM(year.value, month.value)
  year.value = y
  month.value = m
}

const isCurrentMonth = computed(() => year.value === now.getFullYear() && month.value === now.getMonth() + 1)

function goToday() {
  if (isCurrentMonth.value) return
  year.value = now.getFullYear()
  month.value = now.getMonth() + 1
}

const monthEyebrow = computed(() =>
  new Date(year.value, month.value - 1, 1).toLocaleString('en-US', { month: 'long' }).toUpperCase()
)

const doneRows = computed(() =>
  [...(loans.value ?? [])]
    .filter((l) => l.returnedAt)
    .sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
    .map((loan) => {
      const d = parseDbDate(loan.returnedAt as string)
      return { loan, label: `${d.getMonth() + 1}. ${d.getDate()}.` }
    })
)
</script>

<template>
  <div>
    <CommonAppHeader active="calendar" />
    <div class="wrap">
      <div class="page-head">
        <span class="eyebrow">READING CALENDAR</span>
        <h1>도서 달력</h1>
        <p>완독(반납)한 날, 그 책의 표지가 달력에 꽂힙니다</p>
      </div>

      <div class="cal-layout">
        <div class="cal panel" style="padding: 20px 22px;">
          <div class="cal-head">
            <h1>{{ year }}년 {{ month }}월</h1>
            <div class="cal-nav">
              <button type="button" aria-label="이전 달" @click="prevMonth">&#8249;</button>
              <button type="button" aria-label="다음 달" @click="nextMonth">&#8250;</button>
            </div>
            <button
              type="button"
              class="chip"
              :class="{ on: isCurrentMonth }"
              :disabled="isCurrentMonth"
              @click="goToday"
            >이달</button>
          </div>
          <ReadingCalendar :year="year" :month="month" :loans="loans ?? []" />
        </div>

        <div class="aside">
          <div class="panel accent">
            <div class="month-sum">
              <span class="eyebrow">{{ monthEyebrow }}</span>
              <b>이달 <i>{{ (loans ?? []).length }}권</i></b>
              <span>반납일 기준으로 집계했어요</span>
            </div>
          </div>
          <div class="sec-head">
            <h2>이달의 완독</h2>
            <div class="rule" />
          </div>
          <div class="panel" style="padding: 4px 18px;">
            <p v-if="!doneRows.length" class="hint">이달 완독한 책이 없어요.</p>
            <NuxtLink
              v-for="row in doneRows"
              :key="row.loan.id"
              class="done-row"
              :to="`/books/${row.loan.book.id}`"
            >
              <BookCoverImage :src="row.loan.book.coverUrl" :alt="row.loan.book.title" />
              <div><div class="t">{{ row.loan.book.title }}</div><div class="d">{{ row.label }} 완독</div></div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-layout { display: flex; gap: 30px; align-items: flex-start; }
.cal { flex: 1; }
.cal-head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.cal-head h1 { font-family: "Noto Serif KR", serif; font-size: 25px; font-weight: 600; margin: 0; }
.cal-nav { display: flex; gap: 6px; }
.cal-nav button { font: inherit; width: 32px; height: 32px; border-radius: 3px; border: 1px solid var(--line-strong); background: transparent; cursor: pointer; color: var(--sub); font-size: 14px; }
.cal-nav button:hover { background: #F1EADD; }
.cal-head .chip { margin-left: auto; }
.cal-head .chip:disabled { cursor: default; }

.aside { width: 280px; flex-shrink: 0; }
.hint { color: var(--sub); font-size: 13.5px; padding: 14px 0; }
.done-row { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); color: inherit; text-decoration: none; }
.done-row:last-child { border-bottom: 0; }
.done-row :deep(.cv) { width: 38px; height: 54px; }
.done-row .t { font-size: 13.5px; font-weight: 700; margin-bottom: 2px; color: var(--ink); }
.done-row .d { font-size: 12px; color: var(--sub); }
.month-sum { text-align: center; padding: 18px 0 6px; }
.month-sum b { font-family: "Noto Serif KR", serif; font-size: 30px; }
.month-sum b i { font-style: normal; color: var(--red); }
.month-sum span { display: block; font-size: 12.5px; color: var(--sub); margin-top: 4px; }

@media (max-width: 900px) {
  .cal-layout { flex-direction: column; }
  .cal { width: 100%; }
  .aside { width: 100%; }
}
@media (max-width: 640px) {
  .cal.panel { padding: 14px 12px !important; }
  .cal-head { gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .cal-head h1 { font-size: 20px; }
  .cal-nav button { width: 30px; height: 30px; }
}
</style>
