<script setup lang="ts">
import type { Club, DeadlineRunResult } from '#shared/types'
import { clubTitle, josa } from '#shared/utils/clubTitle'

const api = useApi()

const proposals = ref<Club[]>([])
const loading = ref(false)
const running = ref(false)
const runningDeadlines = ref(false)
const deciding = ref(false)
const message = ref('')
const active = ref<Club[]>([])

async function load() {
  loading.value = true
  try {
    proposals.value = await api<Club[]>('/api/admin/club-proposals')
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function loadActive() {
  try {
    active.value = await api<Club[]>('/api/admin/clubs')
  } catch (e) {
    message.value = apiErrorMessage(e)
  }
}

async function cancelClub(club: Club) {
  const t = clubTitle(club)
  if (!confirm(`${t}${josa(t, '을', '를')} 닫을까요? 참가자에게 알림이 가요.`)) return
  try {
    await api(`/api/admin/clubs/${club.id}/cancel`, { method: 'POST' })
    message.value = `${t}${josa(t, '을', '를')} 닫았어요`
    await loadActive()
  } catch (e) {
    message.value = apiErrorMessage(e)
  }
}

const statusLabel: Record<string, string> = { inviting: '모집·초대 중', scheduling: '시간 조율 중', confirmed: '확정' }

async function decide(club: Club, approve: boolean) {
  if (deciding.value) return
  deciding.value = true
  try {
    await api(`/api/admin/club-proposals/${club.id}/${approve ? 'approve' : 'reject'}`, { method: 'POST' })
    message.value = approve
      ? `『${club.bookTitle}』 모임 초대를 보냈어요`
      : `『${club.bookTitle}』 제안을 거절했어요`
    await load()
    await loadActive()
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    deciding.value = false
  }
}

async function runNow() {
  running.value = true
  message.value = ''
  try {
    const result = await api<{ created: number; skipped: number }>('/api/admin/clubs/run-matcher', { method: 'POST' })
    message.value = `제안 ${result.created}건을 만들었어요 (후보에서 제외된 책 ${result.skipped}권)`
    await load()
    await loadActive()
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    running.value = false
  }
}

async function runDeadlinesNow() {
  runningDeadlines.value = true
  message.value = ''
  try {
    const result = await api<DeadlineRunResult>(
      '/api/admin/clubs/run-deadlines',
      { method: 'POST' }
    )
    message.value = `기한 처리 — 모집 만료 ${result.recruitExpired} · 초대 만료 ${result.handled} · 투표 마감 ${result.closed} · 종료 ${result.finished} · 알림 ${result.reminded + result.remindedTomorrow}명 · 후기 요청 ${result.reviewRequested}명`
    await load()
    await loadActive()
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    runningDeadlines.value = false
  }
}

onMounted(() => {
  load()
  loadActive()
})
</script>

<template>
  <section class="queue">
    <header class="queue-head">
      <button class="run" :disabled="running" @click="runNow">
        {{ running ? '찾는 중…' : '매처 지금 실행' }}
      </button>
      <button class="run" :disabled="runningDeadlines" @click="runDeadlinesNow">
        {{ runningDeadlines ? '처리 중…' : '기한 작업 지금 실행' }}
      </button>
    </header>

    <p v-if="message" class="msg">{{ message }}</p>
    <p v-if="loading" class="empty">불러오는 중…</p>
    <p v-else-if="proposals.length === 0" class="empty">대기 중인 제안이 없어요.</p>

    <article v-for="club in proposals" :key="club.id" class="card">
      <div class="title">
        <strong>『{{ club.bookTitle }}』</strong>
        <span class="score">적합도 {{ Math.round(club.matchScore * 100) }}점</span>
      </div>
      <p class="reason">{{ club.matchReason }}</p>

      <ul class="members">
        <li v-for="m in club.members" :key="m.userId">
          {{ m.userName }}<span class="dept">{{ m.department }}</span>
          <span v-if="m.role === 'host'" class="host">진행</span>
        </li>
      </ul>

      <details v-if="club.agenda.length > 0" class="agenda">
        <summary>토론 질문 {{ club.agenda.length }}개</summary>
        <ol>
          <li v-for="(item, i) in club.agenda" :key="i">
            {{ item.question }}
            <p v-for="(ev, j) in item.evidence" :key="j" class="quote">
              {{ ev.userName }}: “{{ ev.quote }}”
            </p>
          </li>
        </ol>
      </details>

      <div class="actions">
        <button class="ok" :disabled="deciding" @click="decide(club, true)">승인하고 초대 보내기</button>
        <button class="no" :disabled="deciding" @click="decide(club, false)">거절</button>
      </div>
    </article>

    <h3 class="sub-head">진행 중인 모임 ({{ active.length }})</h3>
    <p v-if="active.length === 0" class="empty">진행 중인 모임이 없어요.</p>
    <article v-for="club in active" :key="club.id" class="card row">
      <div class="grow">
        <strong>{{ clubTitle(club) }}</strong>
        <span class="origin">{{ club.origin === 'user' ? '사람' : '에이전트' }}</span>
        <p class="reason">『{{ club.bookTitle }}』 · {{ statusLabel[club.status] ?? club.status }} · {{ club.members.filter((m) => m.inviteStatus === 'accepted').length }}명</p>
      </div>
      <button class="no" @click="cancelClub(club)">닫기</button>
    </article>
  </section>
</template>

<style scoped>
.queue { margin-top: 32px; }
.queue-head { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.run { padding: 6px 12px; border: 1px solid var(--line, #ddd); border-radius: 6px; background: #fff; cursor: pointer; }
.run:disabled { opacity: 0.6; cursor: default; }
.msg { margin: 8px 0; font-size: 14px; color: var(--muted, #666); }
.empty { color: var(--muted, #666); font-size: 14px; }
.card { border: 1px solid var(--line, #eee); border-radius: 10px; padding: 14px; margin-top: 12px; }
.title { display: flex; align-items: baseline; gap: 10px; }
.score { font-size: 13px; color: var(--muted, #666); }
.reason { margin: 6px 0 10px; font-size: 14px; }
.members { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 0 0 10px; }
.members li { font-size: 13px; background: var(--chip, #f5f5f5); border-radius: 999px; padding: 3px 10px; }
.dept { color: var(--muted, #888); margin-left: 5px; }
.host { color: var(--red); margin-left: 5px; font-weight: 600; }
.agenda { font-size: 14px; margin-bottom: 10px; }
.quote { margin: 3px 0 6px; font-size: 13px; color: var(--muted, #666); }
.actions { display: flex; gap: 8px; }
.sub-head { font-size: 15px; margin: 24px 0 4px; }
.card.row { display: flex; align-items: center; gap: 12px; }
.grow { flex: 1; min-width: 0; }
.origin { margin-left: 8px; font-size: 12px; padding: 1px 7px; border-radius: 999px; background: var(--chip, #f5f5f5); color: var(--muted, #666); }
.actions button, .card.row button { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--line, #ddd); cursor: pointer; }
.ok { background: var(--red); color: #fff; border-color: var(--red); }
.no { background: #fff; }
@media (max-width: 640px) {
  .queue-head { flex-direction: column; align-items: stretch; }
  .actions { flex-direction: column; }
}
</style>
