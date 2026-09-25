<script setup lang="ts">
import type { Club, Place } from '#shared/types'
import { formatKst, placeLocked as isPlaceLocked } from '#shared/utils/clubTime'
import { clubTitle } from '#shared/utils/clubTitle'
import { joinWindowOpen, hasSeat } from '#shared/utils/clubOpen'
import { kakaoMapUrl } from '~/utils/place'

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
const showInvite = ref(false)
const showConfirm = ref(false)
const editingCandidates = ref(false)
const candidateDraft = ref<string[]>([])
const now = ref(new Date())
onMounted(() => { const t = setInterval(() => { now.value = new Date() }, 60_000); onBeforeUnmount(() => clearInterval(t)) })

const me = computed(() => club.value?.members.find((m) => m.userId === user.value?.id))
const isHost = computed(() => me.value?.role === 'host')
const isMember = computed(() => me.value?.inviteStatus === 'accepted')
const title = computed(() => (club.value ? clubTitle(club.value) : ''))
const isUserClub = computed(() => club.value?.origin === 'user')
const host = computed(() => club.value?.members.find((m) => m.role === 'host'))
const acceptedCount = computed(() => club.value?.members.filter((m) => m.inviteStatus === 'accepted').length ?? 0)
const isFull = computed(() => !!club.value && !hasSeat(club.value))
const windowOpen = computed(() => !!club.value && joinWindowOpen(club.value, now.value))
const isRecruiting = computed(() => isUserClub.value && club.value?.status === 'inviting')

const canRespond = computed(() => club.value?.status === 'inviting' && me.value?.inviteStatus === 'invited')
const canJoin = computed(() => windowOpen.value && !isMember.value && !canRespond.value && !isFull.value)
const canLeave = computed(() => windowOpen.value && isMember.value && !isHost.value)
const canInvite = computed(() => windowOpen.value && isHost.value)
const canWithdraw = computed(() => isRecruiting.value && isHost.value)
const hasCandidates = computed(() => (club.value?.candidateSlots.length ?? 0) > 0)
const canConfirm = computed(() => isRecruiting.value && isHost.value && hasCandidates.value)
const canCloseLegacy = computed(() => isRecruiting.value && isHost.value && !hasCandidates.value)
const canEditCandidates = computed(() => isRecruiting.value && isHost.value)
const canVote = computed(() => isMember.value && ((club.value?.status === 'scheduling') || isRecruiting.value) && hasCandidates.value)

const placeLocked = computed(() => (club.value ? isPlaceLocked(club.value, now.value) : false))
const canPickPlace = computed(() => isHost.value && (club.value?.status === 'scheduling' || club.value?.status === 'confirmed') && !placeLocked.value)
const placeForMap = computed<Place | null>(() =>
  club.value?.place ? { name: club.value.place.name, kakaoId: club.value.place.kakaoId, lat: club.value.place.lat, lng: club.value.place.lng, category: '', address: '', mapx: 0, mapy: 0 } : null
)
const isGenericAgenda = computed(() => (club.value?.agenda.length ?? 0) > 0 && club.value!.agenda.every((a) => a.evidence.length === 0))
const chatCanRead = computed(() => isMember.value)
const chatCanWrite = computed(() => isMember.value && club.value?.status !== 'done' && club.value?.status !== 'canceled')

const daysLeft = computed(() => {
  const until = club.value?.status === 'scheduling' ? club.value.voteExpiresAt : isRecruiting.value ? club.value?.recruitUntil : null
  if (!until) return null
  const diff = new Date(until).getTime() - now.value.getTime()
  return diff <= 0 ? 0 : Math.ceil(diff / (24 * 60 * 60 * 1000))
})
/** 헤더 상태 배지 문구. */
const statusBadge = computed(() => {
  const c = club.value
  if (!c) return ''
  switch (c.status) {
    case 'inviting': return isUserClub.value ? `모집 중${daysLeft.value !== null ? ` · D-${daysLeft.value}` : ''}` : '초대 응답 중'
    case 'scheduling': return `시간 조율 중${daysLeft.value !== null ? ` · D-${daysLeft.value}` : ''}`
    case 'confirmed': return `확정 · ${formatKst(c.meetAt!)}`
    case 'done': return '끝난 모임'
    case 'canceled': return '취소된 모임'
    default: return ''
  }
})
const wherePlaceholder = computed(() => {
  const s = club.value?.status
  if (s === 'scheduling' || s === 'confirmed') return isHost.value ? '아직 장소를 정하지 않았어요' : '개설자가 장소를 고르는 중이에요'
  if (s === 'inviting') return isUserClub.value ? '시간이 정해지면 개설자가 골라요' : '초대 응답이 모이면 정해져요'
  return '정해지지 않았어요'
})
/** 왜 못 누르는지 — 액션 줄 옆 한 줄. */
const actionHint = computed(() => {
  if (!club.value) return ''
  if (isFull.value && !isMember.value && windowOpen.value) return '정원이 찼어요'
  if (club.value.status === 'confirmed' && !windowOpen.value && !isMember.value) return '모임이 코앞이라 참여가 닫혔어요'
  if (canCloseLegacy.value) return acceptedCount.value < 3 ? `3명이 모여야 시스템이 후보 시간을 만들 수 있어요 (지금 ${acceptedCount.value}명)` : '후보 시간이 없어 마감하면 시스템이 후보 3개를 만들고 투표를 받아요'
  return ''
})

// ── 투표
const picked = ref<number[]>([])
watch(club, (c) => { picked.value = c ? c.votes.filter((v) => v.userId === user.value?.id).map((v) => v.slotIdx) : [] }, { immediate: true })
function countFor(idx: number): number { return club.value?.votes.filter((v) => v.slotIdx === idx).length ?? 0 }
const maxCount = computed(() => Math.max(1, ...(club.value?.candidateSlots.map((_, i) => countFor(i)) ?? [0])))
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
  } catch (e) { message.value = apiErrorMessage(e) } finally { sendingVote.value = false }
}

// ── 후보 편집(개설자)
function startEditCandidates() { candidateDraft.value = [...(club.value?.candidateSlots ?? [])]; editingCandidates.value = true }
async function saveCandidates() {
  if (sending.value) return
  sending.value = true
  try {
    await api(`/api/clubs/${clubId.value}/candidates`, { method: 'PUT', body: { slots: candidateDraft.value } })
    editingCandidates.value = false
    message.value = '후보 시간을 고쳤어요'
    await refresh()
  } catch (e) { message.value = apiErrorMessage(e) } finally { sending.value = false }
}

async function downloadIcs() {
  try {
    const text = await api<string>(`/api/clubs/${clubId.value}/ics`, { responseType: 'text' })
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }))
    const a = document.createElement('a'); a.href = url; a.download = `club-${clubId.value}.ics`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (e) { message.value = apiErrorMessage(e) }
}
async function respond(accept: boolean) {
  if (sending.value) return
  sending.value = true
  try {
    await api(`/api/clubs/${clubId.value}/respond`, { method: 'POST', body: { accept } })
    message.value = accept ? '참여로 응답했어요' : '이번에는 참여하지 않는 것으로 응답했어요'
    await refresh()
  } catch (e) { message.value = apiErrorMessage(e) } finally { sending.value = false }
}
async function act(path: string, method: 'POST' | 'DELETE', done: string, confirmText?: string) {
  if (sending.value) return
  if (confirmText && !confirm(confirmText)) return
  sending.value = true
  try {
    await api(`/api/clubs/${clubId.value}/${path}`, { method })
    message.value = done
    await refresh()
  } catch (e) { message.value = apiErrorMessage(e) } finally { sending.value = false }
}
onMounted(() => { if (route.query.chat !== undefined) nextTick(() => document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' })) })
</script>

<template>
  <div>
    <CommonAppHeader active="clubs" />
    <main v-if="!club" class="wrap detail">
      <NuxtLink class="back" to="/clubs">← 책모임</NuxtLink>
      <p v-if="pending" class="empty">불러오는 중…</p>
      <p v-else class="empty">{{ error ? apiErrorMessage(error) : '모임을 찾을 수 없어요' }}</p>
    </main>
    <main v-if="club" class="wrap detail">
      <NuxtLink class="back" to="/clubs">← 책모임</NuxtLink>

      <div class="page-head">
        <span class="eyebrow">BOOK CLUB <span class="badge-st" :class="club.status">{{ statusBadge }}</span></span>
        <h1>{{ title }}</h1>
        <p v-if="isUserClub">『{{ club.bookTitle }}』 · {{ host?.userName }} 님이 열었어요 · {{ acceptedCount }}/{{ club.capacity }}명</p>
        <p v-else>{{ club.matchReason }}</p>
        <p v-if="isUserClub && club.description" class="desc">{{ club.description }}</p>
      </div>

      <div class="actions">
        <template v-if="canRespond">
          <button class="btn primary" :disabled="sending" @click="respond(true)">참여할게요</button>
          <button class="btn" :disabled="sending" @click="respond(false)">이번엔 어려워요</button>
        </template>
        <button v-if="canJoin" class="btn primary" :disabled="sending" @click="act('join', 'POST', '참여했어요')">참여하기</button>
        <button v-if="canConfirm" class="btn primary" :disabled="sending" @click="showConfirm = true">시간 확정</button>
        <button v-if="canCloseLegacy" class="btn primary" :disabled="sending || acceptedCount < 3" @click="act('close-recruiting', 'POST', '모집을 닫고 시간 투표를 시작했어요', '모집을 닫고 시간 투표를 시작할까요?')">모집 마감 → 시간 잡기</button>
        <button v-if="canInvite" class="btn" :disabled="sending" @click="showInvite = true">초대하기</button>
        <NuxtLink v-if="canPickPlace" class="btn" :to="`/places?forClub=${club.id}`">{{ club.place ? '장소 바꾸기' : '장소 고르기' }}</NuxtLink>
        <button v-if="club.meetAt && isMember" type="button" class="btn" @click="downloadIcs">내 캘린더에 추가</button>
        <button v-if="canLeave" class="btn" :disabled="sending" @click="act('join', 'DELETE', '참여를 취소했어요', '참여를 취소할까요?')">참여 취소</button>
        <button v-if="canWithdraw" class="btn danger" :disabled="sending" @click="act('withdraw', 'POST', '모임을 접었어요', '모임을 접을까요? 참가자에게 알림이 가요.')">모임 접기</button>
        <span v-if="actionHint" class="hint">{{ actionHint }}</span>
      </div>
      <p v-if="message" class="msg">{{ message }}</p>

      <div class="cols">
        <div class="main">
          <section class="panel sched">
            <div class="sec-title"><h2>일정</h2><span v-if="isRecruiting && hasCandidates" class="sub">참가자가 고른 시간이 많은 순</span></div>

            <template v-if="club.meetAt">
              <p class="when"><b>언제</b> {{ formatKst(club.meetAt) }}</p>
            </template>
            <template v-else-if="hasCandidates">
              <div v-if="editingCandidates" class="edit">
                <ClubCandidateEditor v-model="candidateDraft" />
                <div class="edit-acts">
                  <button type="button" class="btn sm" @click="editingCandidates = false">취소</button>
                  <button type="button" class="btn sm primary" :disabled="sending" @click="saveCandidates">저장</button>
                </div>
              </div>
              <template v-else>
                <label v-for="(slot, i) in club.candidateSlots" :key="slot" class="slot">
                  <input v-model="picked" type="checkbox" :value="i" :disabled="!canVote" />
                  <span class="slot-time">{{ formatKst(slot) }}</span>
                  <span class="bar"><span class="fill" :class="{ top: countFor(i) === maxCount && countFor(i) > 0 }" :style="{ width: `${(countFor(i) / maxCount) * 100}%` }" /></span>
                  <span class="slot-count">{{ countFor(i) }}명</span>
                </label>
                <div class="slot-acts">
                  <button v-if="canVote" type="button" class="btn sm primary" :disabled="sendingVote" @click="submitVotes">투표 저장</button>
                  <span v-else-if="!isMember" class="sub">참여하면 투표할 수 있어요</span>
                  <button v-if="canEditCandidates" type="button" class="btn sm" @click="startEditCandidates">후보 고치기</button>
                  <span v-if="club.status === 'scheduling'" class="sub">마감되면 가장 많이 고른 시간으로 정해져요. 전원이 고르면 바로 정해져요.</span>
                </div>
              </template>
            </template>
            <template v-else>
              <p class="when"><b>언제</b> <span class="sub">{{ isRecruiting ? '아직 후보 시간이 없어요' : '투표로 정해져요' }}</span></p>
              <button v-if="canEditCandidates && !editingCandidates" type="button" class="btn sm" @click="startEditCandidates">후보 시간 내기</button>
              <div v-if="editingCandidates" class="edit">
                <ClubCandidateEditor v-model="candidateDraft" />
                <div class="edit-acts">
                  <button type="button" class="btn sm" @click="editingCandidates = false">취소</button>
                  <button type="button" class="btn sm primary" :disabled="sending" @click="saveCandidates">저장</button>
                </div>
              </div>
            </template>

            <p class="where">
              <b>어디서</b>
              <template v-if="club.place">
                {{ club.place.name }} <span class="sub">(장소 확정)</span>
                <a v-if="placeForMap" class="map-link" :href="kakaoMapUrl(placeForMap, 'map')" target="_blank" rel="noopener">카카오맵</a>
              </template>
              <span v-else class="sub">{{ wherePlaceholder }}</span>
            </p>
            <p v-if="isHost && placeLocked && club.place" class="sub">모임 당일에는 장소를 바꿀 수 없어요.</p>
          </section>

          <section class="panel">
            <div class="sec-title"><h2>참가자 {{ acceptedCount }}<span v-if="isUserClub">/{{ club.capacity }}</span>명</h2></div>
            <ul class="members">
              <li v-for="m in club.members" :key="m.userId" class="chip" :class="{ off: m.inviteStatus === 'declined' }">
                {{ m.userName }}<span class="dept">{{ m.department }}</span>
                <span v-if="m.role === 'host'" class="tag host">진행</span>
                <span v-if="m.completed" class="tag ok">완독</span>
                <span v-if="m.inviteStatus === 'invited'" class="tag">초대</span>
                <span v-else-if="m.inviteStatus === 'declined'" class="tag">불참</span>
              </li>
            </ul>
          </section>

          <section v-if="club.agenda.length > 0" class="panel">
            <div class="sec-title"><h2>토론 질문</h2><span v-if="isGenericAgenda" class="sub">리뷰가 없어 일반 질문으로 준비했어요</span></div>
            <ol class="agenda">
              <li v-for="(item, i) in club.agenda" :key="i">
                <p class="q">{{ item.question }}</p>
                <p v-for="(ev, j) in item.evidence" :key="j" class="quote">{{ ev.userName }}님 리뷰: “{{ ev.quote }}”</p>
              </li>
            </ol>
          </section>
          <p v-else-if="isRecruiting" class="sub agenda-hint">시간이 정해지면 참가자 리뷰로 토론 질문을 만들어 드려요.</p>
        </div>

        <aside id="chat" class="side">
          <ClubClubChat :key="club.id" :club-id="club.id" :can-read="chatCanRead" :can-write="chatCanWrite" />
        </aside>
      </div>

      <ClubInviteDialog v-if="showInvite" :club-id="club.id" :exclude-ids="club.members.filter((m) => m.inviteStatus !== 'declined').map((m) => m.userId)" @close="showInvite = false" @invited="message = '초대를 보냈어요'; refresh()" />
      <ClubConfirmDialog v-if="showConfirm" :club="club" @close="showConfirm = false" @confirmed="message = '시간을 정했어요'; refresh()" />
    </main>
  </div>
</template>

<style scoped>
.detail { max-width: 1100px; padding-top: 28px; }
.back { display: inline-block; font-size: 13.5px; color: var(--sub); margin-bottom: 18px; }
.back:hover { color: var(--ink); }
.empty { color: var(--sub); font-size: 14px; }
.page-head { margin-bottom: 18px; }
.page-head .desc { margin-top: 10px; color: var(--ink); font-size: 14.5px; white-space: pre-wrap; max-width: 64ch; }
.badge-st { margin-left: 10px; letter-spacing: 0; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 3px; background: var(--hover); color: var(--sub); }
.badge-st.inviting, .badge-st.scheduling { background: var(--red-tint); color: var(--red); }
.badge-st.confirmed { background: var(--ok-tint); color: var(--ok); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 8px; }
.actions .danger { color: var(--red); }
.hint { font-size: 13px; color: var(--sub); }
.msg { margin: 0 0 12px; font-size: 13.5px; color: var(--red-text); }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; margin-top: 14px; }
.main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.side { position: sticky; top: 24px; height: calc(100vh - 120px); min-height: 420px; }
.side > * { height: 100%; }
.sec-title { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.sec-title h2 { margin: 0; font-size: 16px; font-weight: 600; }
.sub { font-size: 13px; color: var(--sub); }
.when, .where { margin: 6px 0; font-size: 14.5px; }
.when b, .where b { display: inline-block; width: 52px; color: var(--sub); font-weight: 600; font-size: 12.5px; letter-spacing: 1px; }
.map-link { margin-left: 8px; font-size: 13px; }
.slot { display: grid; grid-template-columns: auto 1fr 140px 44px; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 14.5px; cursor: pointer; }
.slot:first-of-type { border-top: 0; }
.bar { height: 6px; background: var(--bar-track); border-radius: 3px; overflow: hidden; }
.fill { display: block; height: 100%; background: var(--bar-fill); }
.fill.top { background: var(--red); }
.slot-count { text-align: right; font-size: 13px; color: var(--sub); }
.slot-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; }
.edit { margin: 6px 0 10px; }
.edit-acts { display: flex; gap: 8px; margin-top: 10px; }
.members { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.members .chip { cursor: default; color: var(--ink); }
.members .chip.off { color: var(--muted); }
.dept { margin-left: 5px; color: var(--muted); font-size: 12px; }
.tag { margin-left: 6px; font-size: 11.5px; color: var(--muted); }
.tag.host { color: var(--red); font-weight: 700; }
.tag.ok { color: var(--ok); }
.agenda { padding-left: 20px; margin: 0; }
.agenda .q { margin: 0; font-size: 15px; }
.quote { margin: 4px 0 10px; font-size: 13px; color: var(--sub); }
.agenda-hint { margin: 0; }
@media (max-width: 900px) {
  .cols { grid-template-columns: 1fr; }
  .side { position: static; height: 440px; }
  .slot { grid-template-columns: auto 1fr 44px; }
  .bar { display: none; }
}
</style>
