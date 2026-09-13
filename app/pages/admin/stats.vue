<script setup lang="ts">
import type { StatRow } from '#shared/types'

type StatsBy = 'department' | 'gender' | 'age' | 'position' | 'company' | 'team'
type Period = 'month' | 'all'

const api = useApi()
const { user } = useCurrentUser()
const isAdmin = computed(() => user.value?.role === 'admin')

const GROUPS: { key: StatsBy; label: string }[] = [
  { key: 'department', label: '부서별' },
  { key: 'gender', label: '성별' },
  { key: 'age', label: '나이대별' },
  { key: 'position', label: '직급별' },
  { key: 'company', label: '계열사별' },
  { key: 'team', label: '팀별' },
]

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: '이달' },
  { key: 'all', label: '전체' },
]

const by = ref<StatsBy>('department')
const period = ref<Period>('month')
const showTable = ref(false)

const groupLabel = computed(() => GROUPS.find((g) => g.key === by.value)?.label ?? '')

const now = new Date()
const monthLabel = computed(() =>
  period.value === 'month' ? `${now.getFullYear()}년 ${now.getMonth() + 1}월` : '전체 기간'
)

const { data: rows } = await useAsyncData<StatRow[]>(
  'admin-stats',
  () =>
    isAdmin.value
      ? api<StatRow[]>('/api/stats', { query: { by: by.value, period: period.value } })
      : Promise.resolve([]),
  { watch: [by, period], default: () => [] }
)

const { data: ageRows } = await useAsyncData<StatRow[]>(
  'admin-stats-age',
  () =>
    isAdmin.value ? api<StatRow[]>('/api/stats', { query: { by: 'age', period: period.value } }) : Promise.resolve([]),
  { watch: [period], default: () => [] }
)

// 나이대는 완독 순이 아니라 20대→50대+ 자연스러운 순서로 보여줘야 읽기 편하다.
function ageSortKey(label: string): number {
  return label.includes('+') ? 999 : Number.parseInt(label, 10)
}

const ageVColRows = computed(() =>
  [...(ageRows.value ?? [])]
    .sort((a, b) => ageSortKey(a.label) - ageSortKey(b.label))
    .map((r) => ({ label: r.label, value: r.doneCount }))
)

const mainHBarRows = computed(() =>
  (rows.value ?? []).map((r) => ({ label: r.label, value: r.doneCount, sub: `인당 ${r.perHead}` }))
)

const totalDone = computed(() => (rows.value ?? []).reduce((sum, r) => sum + r.doneCount, 0))
const totalHead = computed(() => (rows.value ?? []).reduce((sum, r) => sum + r.headCount, 0))
const topGroupLabel = computed(() => rows.value?.[0]?.label ?? '-')
const avgPerHead = computed(() => (totalHead.value > 0 ? Math.round((totalDone.value / totalHead.value) * 10) / 10 : 0))
</script>

<template>
  <div>
    <AdminHeader active="stats" />
    <div class="wrap">
      <div class="page-head">
        <span class="eyebrow">READING ANALYTICS</span>
        <h1>독서 통계</h1>
      </div>

      <div class="filters">
        <select v-model="by" aria-label="통계 그룹 선택">
          <option v-for="g in GROUPS" :key="g.key" :value="g.key">그룹: {{ g.label }}</option>
        </select>
        <span
          v-for="p in PERIODS"
          :key="p.key"
          class="chip"
          :class="{ on: period === p.key }"
          @click="period = p.key"
        >{{ p.label }}</span>
      </div>

      <div class="cols2">
        <div class="panel">
          <div class="sec-head" style="margin-top:0; margin-bottom: 22px;">
            <h2>{{ groupLabel }} 완독 권수 <span class="period-label">{{ monthLabel }}</span></h2>
            <div class="rule" />
            <button
              type="button"
              class="tbl-link link-btn"
              :aria-pressed="showTable"
              @click="showTable = !showTable"
            >{{ showTable ? '차트로 보기' : '표로 보기' }}</button>
          </div>

          <AdminHBarChart v-if="!showTable" :rows="mainHBarRows" />
          <template v-else>
            <p v-if="!rows?.length" class="hint">데이터가 없어요</p>
            <table v-else class="table">
              <tr><th>{{ groupLabel }}</th><th>완독</th><th>대출</th><th>인원</th><th>인당</th></tr>
              <tr v-for="row in rows" :key="row.label">
                <td>{{ row.label }}</td>
                <td>{{ row.doneCount }}권</td>
                <td>{{ row.loanCount }}권</td>
                <td>{{ row.headCount }}명</td>
                <td>{{ row.perHead }}</td>
              </tr>
            </table>
          </template>

          <div class="axis-note">완독 = 반납 완료 기준</div>
        </div>

        <div>
          <div class="panel" style="margin-bottom: 24px;">
            <div class="sec-head" style="margin-top:0; margin-bottom: 20px;">
              <h2>나이대별</h2>
              <div class="rule" />
            </div>
            <AdminVColChart :rows="ageVColRows" />
          </div>

          <div class="panel">
            <div class="sec-head" style="margin-top:0; margin-bottom: 16px;">
              <h2>요약</h2>
              <div class="rule" />
            </div>
            <table class="table">
              <tr><td style="color:var(--sub);">완독 합계</td><td style="text-align:right;"><b>{{ totalDone }}권</b></td></tr>
              <tr><td style="color:var(--sub);">최다 그룹</td><td style="text-align:right;"><b>{{ topGroupLabel }}</b></td></tr>
              <tr><td style="color:var(--sub);">인당 평균</td><td style="text-align:right;"><b>{{ avgPerHead }}권</b></td></tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 10px; margin-bottom: 26px; align-items: center; }
.filters select { font: inherit; font-size: 13.5px; color: var(--ink); background: var(--card); border: 1px solid var(--line-strong); border-radius: 3px; padding: 8px 12px; outline: 0; }

.axis-note { font-size: 11.5px; color: var(--sub); margin-top: 14px; }
.cols2 { display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; align-items: start; }
.tbl-link { font-size: 12.5px; }
.link-btn { background: none; border: 0; padding: 0; font: inherit; color: var(--red); cursor: pointer; }
.link-btn:hover { color: var(--red-dark); }
.period-label { font-family: Pretendard, sans-serif; font-size: 12.5px; color: var(--sub); font-weight: 500; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }
</style>
