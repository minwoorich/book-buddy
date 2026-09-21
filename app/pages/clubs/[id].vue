<script setup lang="ts">
import type { Club } from '#shared/types'
import { formatKst } from '#shared/utils/clubTime'

const api = useApi()
const route = useRoute()
const { user } = useCurrentUser()

const clubId = computed(() => Number(route.params.id))
const { data: club, pending, error, refresh } = await useAsyncData<Club | null>(
  () => `club-${clubId.value}`,
  () => api<Club>(`/api/clubs/${clubId.value}`),
  { default: () => null, watch: [clubId] }
)

const message = ref('')
const sending = ref(false)

const me = computed(() => club.value?.members.find((m) => m.userId === user.value?.id))
const canRespond = computed(() => club.value?.status === 'inviting' && me.value?.inviteStatus === 'invited')
/** 근거가 하나도 없으면 리뷰 없이 만든 일반 질문이다 — 그 사실을 숨기지 않는다. */
const isGenericAgenda = computed(
  () => (club.value?.agenda.length ?? 0) > 0 && club.value!.agenda.every((a) => a.evidence.length === 0)
)

const canVote = computed(() => club.value?.status === 'scheduling' && me.value?.inviteStatus === 'accepted')
const picked = ref<number[]>([])
watch(club, (c) => {
  picked.value = c ? c.votes.filter((v) => v.userId === user.value?.id).map((v) => v.slotIdx) : []
}, { immediate: true })
function countFor(idx: number): number {
  return club.value?.votes.filter((v) => v.slotIdx === idx).length ?? 0
}
const voteDaysLeft = computed(() => {
  const until = club.value?.voteExpiresAt
  if (!until) return null
  const diff = new Date(until).getTime() - Date.now()
  return diff <= 0 ? 0 : Math.ceil(diff / (24 * 60 * 60 * 1000))
})
const sendingVote = ref(false)
async function submitVotes() {
  if (sendingVote.value) return
  if (picked.value.length === 0) { message.value = '가능한 시간을 하나 이상 골라주세요'; return }
  sendingVote.value = true
  try {
    await api(`/api/clubs/${clubId.value}/votes`, { method: 'POST', body: { slotIdxs: picked.value } })
    message.value = '투표를 저장했어요'
    await refresh()
    if (club.value?.status === 'confirmed') message.value = '전원이 투표해서 시간이 정해졌어요'
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    sendingVote.value = false
  }
}

/** x-user-id 헤더가 필요해 <a href>로는 401이 난다 — fetch로 받아 Blob으로 내려준다. */
async function downloadIcs() {
  try {
    const text = await api<string>(`/api/clubs/${clubId.value}/ics`, { responseType: 'text' })
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `club-${clubId.value}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (e) {
    message.value = apiErrorMessage(e)
  }
}

async function respond(accept: boolean) {
  if (sending.value) return
  sending.value = true
  try {
    await api(`/api/clubs/${clubId.value}/respond`, { method: 'POST', body: { accept } })
    message.value = accept ? '참여로 응답했어요' : '이번에는 참여하지 않는 것으로 응답했어요'
    await refresh()
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <CommonAppHeader active="clubs" />
    <main v-if="!club" class="wrap">
      <NuxtLink class="back" to="/clubs">← 책모임</NuxtLink>
      <p v-if="pending" class="empty">불러오는 중…</p>
      <p v-else class="empty">{{ error ? apiErrorMessage(error) : '모임을 찾을 수 없어요' }}</p>
    </main>
    <main v-if="club" class="wrap">
      <NuxtLink class="back" to="/clubs">← 책모임</NuxtLink>
      <h1>『{{ club.bookTitle }}』 책모임</h1>
      <p class="reason">{{ club.matchReason }}</p>

      <section v-if="club.meetAt || club.place" class="when-where">
        <p v-if="club.meetAt"><b>언제</b> {{ formatKst(club.meetAt) }}</p>
        <button v-if="club.meetAt" type="button" class="ics" @click="downloadIcs">내 캘린더에 추가 (.ics)</button>
        <!-- 외부 장소라 실제 예약이 아니라 "확정"이다(설계서 §2 비목표). -->
        <p v-if="club.place"><b>어디서</b> {{ club.place.name }} <span class="note">(장소 확정)</span></p>
      </section>

      <section v-if="club.status === 'scheduling' && club.candidateSlots.length > 0" class="vote">
        <h2>시간 투표 <span v-if="voteDaysLeft !== null" class="dday">D-{{ voteDaysLeft }}</span></h2>
        <p class="note">가능한 시간을 모두 골라주세요. 마감되면 가장 많이 고른 시간으로 정해져요. 전원이 고르면 바로 정해져요.</p>
        <label v-for="(slot, i) in club.candidateSlots" :key="slot" class="slot">
          <input v-model="picked" type="checkbox" :value="i" :disabled="!canVote" />
          <span class="slot-time">{{ formatKst(slot) }}</span>
          <span class="slot-count">{{ countFor(i) }}명</span>
        </label>
        <button v-if="canVote" type="button" class="ok-btn slim" :disabled="sendingVote" @click="submitVotes">투표 저장</button>
        <p v-else class="note">참여를 수락한 사람만 투표할 수 있어요.</p>
      </section>

      <section>
        <h2>참가자 {{ club.members.length }}명</h2>
        <ul class="members">
          <li v-for="m in club.members" :key="m.userId">
            {{ m.userName }}<span class="dept">{{ m.department }}</span>
            <span v-if="m.role === 'host'" class="host">진행</span>
            <span v-if="m.inviteStatus === 'accepted'" class="ok">참여</span>
            <span v-else-if="m.inviteStatus === 'declined'" class="no">불참</span>
          </li>
        </ul>
      </section>

      <section v-if="club.agenda.length > 0">
        <h2>토론 질문</h2>
        <p v-if="isGenericAgenda" class="note">리뷰가 없어 일반 질문으로 준비했어요.</p>
        <ol class="agenda">
          <li v-for="(item, i) in club.agenda" :key="i">
            <p class="q">{{ item.question }}</p>
            <p v-for="(ev, j) in item.evidence" :key="j" class="quote">
              {{ ev.userName }}님 리뷰: “{{ ev.quote }}”
            </p>
          </li>
        </ol>
      </section>

      <p v-if="message" class="msg">{{ message }}</p>

      <div v-if="canRespond" class="actions">
        <button class="ok-btn" :disabled="sending" @click="respond(true)">참여할게요</button>
        <button class="no-btn" :disabled="sending" @click="respond(false)">이번엔 어려워요</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 60px; }
.back { font-size: 14px; color: var(--muted, #666); text-decoration: none; }
.empty { margin-top: 16px; color: var(--muted, #666); font-size: 14px; }
h1 { font-size: 22px; margin: 10px 0 4px; }
.reason { color: var(--muted, #666); font-size: 14px; margin: 0 0 20px; }
h2 { font-size: 16px; margin: 24px 0 8px; }
.when-where { background: var(--chip, #f7f7f7); border-radius: 10px; padding: 12px 14px; font-size: 14px; }
.when-where p { margin: 2px 0; }
.note { color: var(--muted, #888); font-size: 13px; }
.members { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.members li { font-size: 13px; background: var(--chip, #f5f5f5); border-radius: 999px; padding: 4px 11px; }
.dept { color: var(--muted, #888); margin-left: 5px; }
.host { color: #e60012; margin-left: 5px; font-weight: 600; }
.ok { color: #1a7f37; margin-left: 5px; }
.no { color: var(--muted, #999); margin-left: 5px; }
.agenda { padding-left: 20px; }
.agenda .q { margin: 0; font-size: 15px; }
.quote { margin: 4px 0 10px; font-size: 13px; color: var(--muted, #666); }
.msg { font-size: 14px; margin: 16px 0 0; }
.actions { display: flex; gap: 10px; margin-top: 24px; }
.actions button { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--line, #ddd); cursor: pointer; font-size: 15px; }
.ok-btn { background: #e60012; color: #fff; border-color: #e60012; }
.no-btn { background: #fff; }
.vote { background: var(--chip, #f7f7f7); border-radius: 10px; padding: 14px 16px; margin-top: 20px; }
.vote h2 { margin: 0 0 6px; }
.vote .dday { margin-left: 8px; font-size: 13px; color: #e60012; font-weight: 700; }
.slot { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line, #e8e8e8); font-size: 15px; }
.slot:first-of-type { border-top: none; }
.slot-count { margin-left: auto; font-size: 13px; color: var(--muted, #777); }
.ok-btn.slim { width: auto; padding: 9px 16px; margin-top: 10px; font-size: 14px; }
.ics { margin-top: 6px; padding: 6px 12px; border: 1px solid var(--line, #ddd); border-radius: 6px; background: #fff; font-size: 13px; cursor: pointer; }
</style>
