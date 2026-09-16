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

// 권수가 같으면 그 권수를 먼저 채운 쪽이 앞선다(QA #93) — 서버가 count DESC, reachedAt ASC로
// 이미 정렬해 내려준다. 그래서 공동 순위는 권수와 달성 시각이 모두 같을 때만 남는다.
// 전체 rows 기준으로 계산해야 top3와 이어지는 순위가 맞는다(포디움 자체는 배치 그대로).
function sameRank(a: RankRow, b: RankRow): boolean {
  return a.count === b.count && (a.reachedAt ?? null) === (b.reachedAt ?? null)
}

function competitionRanks(list: RankRow[]): number[] {
  const ranks: number[] = []
  for (let i = 0; i < list.length; i++) {
    ranks.push(i > 0 && sameRank(list[i], list[i - 1]) ? ranks[i - 1] : i + 1)
  }
  return ranks
}
const restRanks = computed(() => competitionRanks(rows.value ?? []).slice(3))

// 권수가 같은 이웃이 있는 줄에만 "언제 n권을 채웠는지"를 보여준다 — 순위가 갈린 근거.
const tiedKeys = computed(() => {
  const list = rows.value ?? []
  const keys = new Set<string>()
  for (let i = 1; i < list.length; i++) {
    if (list[i].count === list[i - 1].count) {
      keys.add(list[i].key)
      keys.add(list[i - 1].key)
    }
  }
  return keys
})

/** returned_at은 SQLite datetime('now') — UTC 'YYYY-MM-DD HH:MM:SS'라 UTC로 파싱한다. */
function reachedLabel(row: RankRow): string {
  if (!row.reachedAt || !tiedKeys.value.has(row.key)) return ''
  const ms = new Date(row.reachedAt.replace(' ', 'T') + 'Z').getTime()
  if (!Number.isFinite(ms)) return ''
  return `${new Date(ms).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 달성`
}

function barWidth(row: RankRow): number {
  if (!topCount.value) return 0
  return Math.round((row.count / topCount.value) * 100)
}

function isMine(row: RankRow): boolean {
  return by.value === 'user' && !!user.value && row.userId === user.value.id
}

// 개인 랭킹 줄을 누르면 그 사람이 완독한 책과 남긴 리뷰를 모달로 본다.
// 팀·부서·계열사 집계 줄에는 userId가 없어 누를 수 없다.
const pickedUserId = ref<number | null>(null)

function canPick(row: RankRow): boolean {
  return row.userId !== undefined
}

function pick(row: RankRow): void {
  if (row.userId !== undefined) pickedUserId.value = row.userId
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
          <p class="tiebreak">권수가 같으면 <b>그 권수를 먼저 채운 쪽</b>이 앞 순위예요</p>
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
        <ReadingRankPodium :top3="top3" @pick="pick" />

        <div v-if="rest.length" class="panel" style="padding: 6px 6px;">
          <div
            v-for="(row, idx) in rest"
            :key="row.key"
            class="rank-row"
            :class="{ mine: isMine(row), pickable: canPick(row) }"
            :role="canPick(row) ? 'button' : undefined"
            :tabindex="canPick(row) ? 0 : undefined"
            @click="pick(row)"
            @keydown.enter.prevent="pick(row)"
            @keydown.space.prevent="pick(row)"
          >
            <span class="no">{{ restRanks[idx] }}</span>
            <span class="avatar">{{ row.label.charAt(0) }}</span>
            <div class="who">
              <b>{{ row.label }} <span v-if="isMine(row)" class="badge red" style="margin-left:4px;">나</span></b>
              <span v-if="row.sub">{{ row.sub }}</span>
            </div>
            <div class="bar-zone"><div class="bar"><i :style="{ width: barWidth(row) + '%' }" /></div></div>
            <div class="cnt">
              <b>{{ row.count }}권</b>
              <span v-if="reachedLabel(row)" class="reached">{{ reachedLabel(row) }}</span>
            </div>
          </div>
        </div>
      </template>
      <p v-else class="hint">아직 완독 기록이 없어요</p>

      <ReadingReaderProfileModal
        v-if="pickedUserId !== null"
        :user-id="pickedUserId"
        @close="pickedUserId = null"
      />
    </div>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 8px; }
.period { margin-left: auto; display: flex; gap: 8px; }
.tiebreak { margin-top: 5px !important; font-size: 12.5px !important; color: var(--sub); }
.tiebreak b { color: var(--ink); font-weight: 700; }
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
.rank-row .cnt .reached { display: block; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.rank-row.mine { background: var(--red-tint); border-radius: 4px; border-bottom: 0; }
.rank-row.mine .bar i { background: var(--red); }
.rank-row.mine .no { color: var(--red); font-weight: 700; }

.rank-row.pickable { cursor: pointer; }
.rank-row.pickable:hover { background: var(--hover); }
.rank-row.pickable:hover .who b { text-decoration: underline; }
.rank-row.pickable:focus-visible { outline: 2px solid var(--red); outline-offset: -2px; border-radius: 4px; }
.rank-row.mine.pickable:hover { background: var(--red-tint); }

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
