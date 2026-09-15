<script setup lang="ts">
import type { User } from '#shared/types'

type MemberSummary = User & {
  activeLoans: number
  overdueLoans: number
  completedLoans: number
  reviewCount: number
  lastActivityAt: string | null
}

type Filter = 'all' | 'active' | 'overdue' | 'idle'

const api = useApi()
const { user } = useCurrentUser()

const { data: members } = await useAsyncData<MemberSummary[]>(
  'admin-members',
  () => (user.value?.role === 'admin' ? api<MemberSummary[]>('/api/admin/members') : Promise.resolve([])),
  { default: () => [] }
)

const query = ref('')
const filter = ref<Filter>('all')

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '대출중' },
  { key: 'overdue', label: '연체' },
  { key: 'idle', label: '활동 없음' },
]

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (members.value ?? []).filter((m) => {
    if (filter.value === 'active' && m.activeLoans === 0) return false
    if (filter.value === 'overdue' && m.overdueLoans === 0) return false
    if (filter.value === 'idle' && m.lastActivityAt) return false
    if (!q) return true
    return [m.name, m.company, m.department, m.team, m.position].some((v) => v.toLowerCase().includes(q))
  })
})

const totals = computed(() => {
  const list = members.value ?? []
  return {
    members: list.length,
    active: list.reduce((s, m) => s + m.activeLoans, 0),
    overdue: list.filter((m) => m.overdueLoans > 0).length,
  }
})

// 시연용 게스트 일괄 해제 — 게스트 계정이 있을 때만 버튼을 노출한다.
const hasGuests = computed(() => (members.value ?? []).some((m) => m.isGuest))
const releasing = ref(false)
const releasedNote = ref('')

async function releaseGuests() {
  if (releasing.value || !confirm('접속 중인 게스트가 모두 로그아웃됩니다. 게스트 자리를 전부 해제할까요?')) return
  releasing.value = true
  releasedNote.value = ''
  try {
    await api('/api/admin/guests/release-all', { method: 'POST' })
    releasedNote.value = '게스트 자리를 모두 해제했어요'
  } catch (e) {
    releasedNote.value = apiErrorMessage(e)
  } finally {
    releasing.value = false
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = parseDbDate(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}
</script>

<template>
  <div>
    <AdminHeader active="members" />
    <div class="wrap">
      <div class="head-row">
        <div class="page-head" style="margin-bottom: 0;">
          <span class="eyebrow">MEMBERS</span>
          <h1>회원</h1>
          <p>
            전체 {{ totals.members }}명 · 대출중 {{ totals.active }}권
            <template v-if="totals.overdue"> · 연체자 <b class="warn-txt">{{ totals.overdue }}명</b></template>
          </p>
        </div>
        <div class="tools">
          <div v-if="hasGuests" class="guest-tools">
            <button type="button" class="btn sm" :disabled="releasing" @click="releaseGuests">
              {{ releasing ? '해제 중...' : '게스트 전체 해제' }}
            </button>
            <span v-if="releasedNote" class="guest-note">{{ releasedNote }}</span>
          </div>
          <input v-model="query" class="input search" type="search" placeholder="이름·회사·부서·팀 검색">
          <div class="filters">
            <span v-for="f in FILTERS" :key="f.key" class="chip" :class="{ on: filter === f.key }" @click="filter = f.key">{{ f.label }}</span>
          </div>
        </div>
      </div>

      <div class="panel" style="padding: 8px 14px;">
        <table v-if="filtered.length" class="table stack-sm members-table">
          <tbody>
            <tr>
              <th>이름</th>
              <th>소속</th>
              <th style="width: 80px; text-align: right;">대출중</th>
              <th style="width: 80px; text-align: right;">연체</th>
              <th style="width: 80px; text-align: right;">완독</th>
              <th style="width: 80px; text-align: right;">리뷰</th>
              <th style="width: 120px;">마지막 활동</th>
              <th style="width: 80px;"></th>
            </tr>
            <tr v-for="m in filtered" :key="m.id" :class="{ overdue: m.overdueLoans > 0 }">
              <td class="full name-cell">
                <NuxtLink :to="`/admin/members/${m.id}`" class="name-link">
                  <span class="avatar">{{ m.name.charAt(0) }}</span>
                  <b>{{ m.name }}</b>
                  <span v-if="m.role === 'admin'" class="badge red">관리자</span>
                  <span v-else-if="m.isGuest" class="badge">게스트</span>
                </NuxtLink>
              </td>
              <td class="org">{{ m.company }} · {{ m.department }} · {{ m.team }} · {{ m.position }}</td>
              <td class="num">{{ m.activeLoans || '·' }}</td>
              <td class="num"><span v-if="m.overdueLoans" class="badge warn">{{ m.overdueLoans }}</span><span v-else>·</span></td>
              <td class="num">{{ m.completedLoans || '·' }}</td>
              <td class="num">{{ m.reviewCount || '·' }}</td>
              <td class="when">{{ formatWhen(m.lastActivityAt) }}</td>
              <td class="end" style="text-align: right;">
                <NuxtLink :to="`/admin/members/${m.id}`" class="btn sm">이력 보기</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="hint">조건에 맞는 회원이 없어요</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 22px; }
.warn-txt { color: var(--warn); }
.tools { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.tools .search { width: 240px; padding: 8px 12px; font-size: 13.5px; }
.guest-tools { display: flex; align-items: center; gap: 8px; }
.guest-note { font-size: 12.5px; color: var(--sub); }
.filters { display: flex; gap: 8px; }
.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

.name-link { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); text-decoration: none; }
.name-link:hover b { color: var(--red); }
.name-link .avatar { width: 26px; height: 26px; font-size: 12px; }
.org { font-size: 12.5px; color: var(--sub); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.when { font-size: 12.5px; color: var(--sub); white-space: nowrap; }
tr.overdue td { background: var(--warn-tint); }

@media (max-width: 640px) {
  .head-row { flex-direction: column; align-items: flex-start; gap: 12px; }
  .tools { margin-left: 0; flex-wrap: wrap; width: 100%; }
  .tools .search { width: 100%; }
  .members-table th { width: auto !important; }
  .num { text-align: left; }
  .num::before { content: attr(data-label); }
}
</style>
