<script setup lang="ts">
import type { QaFeedback } from '#shared/types'

type QaRow = QaFeedback & { userName: string; department: string }
type Filter = 'open' | 'resolved' | 'all'

const api = useApi()
const { user } = useCurrentUser()

const filter = ref<Filter>('open')

const { data: rows, refresh } = await useAsyncData<QaRow[]>(
  'admin-qa',
  () =>
    user.value
      ? api<QaRow[]>('/api/qa-feedback', {
          query: filter.value === 'all' ? {} : { status: filter.value },
        })
      : Promise.resolve([]),
  { default: () => [], watch: [filter] }
)

const busyId = ref<number | null>(null)

async function setStatus(row: QaRow, status: QaFeedback['status']) {
  if (busyId.value !== null) return
  busyId.value = row.id
  try {
    await api(`/api/qa-feedback/${row.id}`, { method: 'PATCH', body: { status } })
    await refresh()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busyId.value = null
  }
}

function formatWhen(iso: string): string {
  const d = parseDbDate(iso)
  return `${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: '미해결' },
  { key: 'resolved', label: '해결됨' },
  { key: 'all', label: '전체' },
]
</script>

<template>
  <div>
    <AdminHeader active="qa" />
    <div class="wrap">
      <div class="head-row">
        <div class="page-head" style="margin-bottom: 0;">
          <span class="eyebrow">TEAM QA</span>
          <h1>QA 피드백</h1>
          <p>테스터가 앱 안에서 보낸 신고 — 페이지·화면 크기가 자동으로 담겨요</p>
        </div>
        <div class="filters">
          <span
            v-for="f in FILTERS"
            :key="f.key"
            class="chip"
            :class="{ on: filter === f.key }"
            @click="filter = f.key"
          >{{ f.label }}</span>
        </div>
      </div>

      <div class="panel" style="padding: 8px 14px;">
        <table v-if="rows.length" class="table">
          <tbody>
            <tr>
              <th style="width: 90px;">시간</th>
              <th style="width: 130px;">테스터</th>
              <th style="width: 160px;">페이지</th>
              <th>내용</th>
              <th style="width: 90px;">상태</th>
              <th style="width: 90px;"></th>
            </tr>
            <tr v-for="row in rows" :key="row.id">
              <td style="color: var(--sub); font-size: 12.5px;">{{ formatWhen(row.createdAt) }}</td>
              <td>
                {{ row.userName }}
                <div style="font-size: 11.5px; color: var(--sub);">{{ row.department }}</div>
              </td>
              <td>
                <NuxtLink :to="row.path" style="font-size: 12.5px;">{{ row.path }}</NuxtLink>
                <div v-if="row.viewport" style="font-size: 11.5px; color: var(--sub);">{{ row.viewport }}</div>
              </td>
              <td style="font-size: 14px;">{{ row.content }}</td>
              <td>
                <span class="badge" :class="row.status === 'open' ? 'warn' : 'ok'">
                  {{ row.status === 'open' ? '미해결' : '해결됨' }}
                </span>
              </td>
              <td style="text-align: right;">
                <button
                  v-if="row.status === 'open'"
                  class="btn primary sm"
                  :disabled="busyId === row.id"
                  @click="setStatus(row, 'resolved')"
                >해결</button>
                <button
                  v-else
                  class="btn sm"
                  :disabled="busyId === row.id"
                  @click="setStatus(row, 'open')"
                >되돌리기</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="hint">
          {{ filter === 'open' ? '미해결 피드백이 없어요 🎉' : '피드백이 없어요' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 22px; }
.filters { margin-left: auto; display: flex; gap: 8px; }
.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }
</style>
