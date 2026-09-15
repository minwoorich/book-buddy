<script setup lang="ts">
import type { RankRow, RankSnapshot } from '#shared/types'

type RankBy = 'user' | 'team' | 'department' | 'company'
type Period = 'month' | 'all'

const api = useApi()
const { user } = useCurrentUser()

const by = ref<RankBy>('user')
const period = ref<Period>('month')

const TABS: { key: RankBy; label: string }[] = [
  { key: 'user', label: '개인' },
  { key: 'team', label: '팀' },
  { key: 'department', label: '부서' },
  { key: 'company', label: '계열사' },
]

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: '이달' },
  { key: 'all', label: '전체' },
]

const EMPTY_SNAPSHOT: RankSnapshot = { rows: [], updatedAt: '', nextUpdateAt: '' }

const { data: snapshot } = await useAsyncData<RankSnapshot>(
  'rankings',
  () =>
    user.value
      ? api<RankSnapshot>('/api/rankings', { query: { by: by.value, period: period.value } })
      : Promise.resolve(EMPTY_SNAPSHOT),
  { watch: [by, period], default: () => EMPTY_SNAPSHOT }
)
const rows = computed(() => snapshot.value?.rows ?? [])

// 30분 스냅샷(QA #56): 마지막 집계 시각과 다음 갱신 시각을 보여준다.
function timeLabel(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}
const updatedLabel = computed(() => timeLabel(snapshot.value?.updatedAt ?? ''))
const nextUpdateLabel = computed(() => timeLabel(snapshot.value?.nextUpdateAt ?? ''))

const top3 = computed(() => (rows.value ?? []).slice(0, 3))
const rest = computed(() => (rows.value ?? []).slice(3))
// 4위 이하 막대 폭 기준은 1위 권수(전체 목록의 최댓값) 대비 비율.
const topCount = computed(() => rows.value?.[0]?.count ?? 0)

// 표준 경쟁 순위(1224식): count가 같으면 같은 순위, 다음 순위는 동률 인원수만큼 건너뛴다.
// 전체 rows 기준으로 계산해야 top3와 이어지는 순위가 맞는다(포디움 자체는 배치 그대로 — 동률이
// 3위에 걸쳐도 단순화 허용).
function competitionRanks(list: RankRow[]): number[] {
  const ranks: number[] = []
  for (let i = 0; i < list.length; i++) {
    ranks.push(i > 0 && list[i].count === list[i - 1].count ? ranks[i - 1] : i + 1)
  }
  return ranks
}
const restRanks = computed(() => competitionRanks(rows.value ?? []).slice(3))

function barWidth(row: RankRow): number {
  if (!topCount.value) return 0
  return Math.round((row.count / topCount.value) * 100)
}

function isMine(row: RankRow): boolean {
  return by.value === 'user' && !!user.value && row.userId === user.value.id
}
</script>

<template>
  <div>
    <CommonAppHeader active="rankings" />
    <div class="wrap">
      <div class="head-row">
        <div class="page-head" style="margin-bottom:0;">
          <span class="eyebrow">READING LEADERBOARD</span>
          <h1>독서 랭킹</h1>
          <p>대출-반납 기록(완독 권수) 기준으로 집계해요</p>
          <p v-if="updatedLabel" class="updated">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            마지막 업데이트 <b>{{ updatedLabel }}</b> · 다음 업데이트 {{ nextUpdateLabel }} (30분마다 갱신)
          </p>
        </div>
        <div class="period">
          <span
            v-for="p in PERIODS"
            :key="p.key"
            class="chip"
            :class="{ on: period === p.key }"
            @click="period = p.key"
          >{{ p.label }}</span>
        </div>
      </div>

      <div class="tabs" style="margin-bottom: 4px;">
        <span
          v-for="t in TABS"
          :key="t.key"
          class="tab"
          :class="{ on: by === t.key }"
          @click="by = t.key"
        >{{ t.label }}</span>
      </div>

      <template v-if="(rows ?? []).length">
        <ReadingRankPodium :top3="top3" />

        <div v-if="rest.length" class="panel" style="padding: 6px 6px;">
          <div
            v-for="(row, idx) in rest"
            :key="row.key"
            class="rank-row"
            :class="{ mine: isMine(row) }"
          >
            <span class="no">{{ restRanks[idx] }}</span>
            <span class="avatar">{{ row.label.charAt(0) }}</span>
            <div class="who">
              <b>{{ row.label }} <span v-if="isMine(row)" class="badge red" style="margin-left:4px;">나</span></b>
              <span v-if="row.sub">{{ row.sub }}</span>
            </div>
            <div class="bar-zone"><div class="bar"><i :style="{ width: barWidth(row) + '%' }" /></div></div>
            <div class="cnt"><b>{{ row.count }}권</b></div>
          </div>
        </div>
      </template>
      <p v-else class="hint">아직 완독 기록이 없어요</p>
    </div>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 8px; }
.period { margin-left: auto; display: flex; gap: 8px; }
.updated { display: flex; align-items: center; gap: 5px; margin-top: 8px !important; font-size: 12.5px !important; color: var(--sub); }
.updated b { color: var(--ink); }

.rank-row { display: flex; align-items: center; gap: 16px; padding: 13px 18px; border-bottom: 1px solid var(--line); }
.rank-row:last-child { border-bottom: 0; }
.rank-row .no { font-family: var(--font-display); font-size: 17px; width: 28px; color: var(--sub); text-align: center; }
.rank-row .who { width: 210px; }
.rank-row .who b { font-size: 14.5px; display: block; }
.rank-row .who span { font-size: 12px; color: var(--sub); }
.rank-row .bar-zone { flex: 1; }
.rank-row .bar { height: 8px; background: var(--bar-track); border-radius: 999px; overflow: hidden; }
.rank-row .bar i { display: block; height: 100%; background: var(--line-hover); border-radius: 999px; }
.rank-row .cnt { width: 130px; text-align: right; font-size: 13.5px; color: var(--sub); }
.rank-row .cnt b { color: var(--ink); font-size: 15px; }
.rank-row.mine { background: var(--red-tint); border-radius: 4px; border-bottom: 0; }
.rank-row.mine .bar i { background: var(--red); }
.rank-row.mine .no { color: var(--red); font-weight: 700; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 640px) {
  .head-row { flex-direction: column; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
  .period { margin-left: 0; flex-wrap: wrap; }
  .rank-row { flex-wrap: wrap; gap: 10px 12px; padding: 12px 10px; }
  .rank-row .no { width: 22px; font-size: 15px; }
  .rank-row .who { flex: 1; width: auto; min-width: 0; }
  .rank-row .who b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rank-row .cnt { width: auto; }
  .rank-row .bar-zone { flex-basis: 100%; order: 5; }
}
</style>
