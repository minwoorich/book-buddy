<script setup lang="ts">
import type { Club, Place } from '#shared/types'
import { formatKst, placeLocked as isPlaceLocked } from '#shared/utils/clubTime'
import { clubTitle } from '#shared/utils/clubTitle'
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

const me = computed(() => club.value?.members.find((m) => m.userId === user.value?.id))
const canRespond = computed(() => club.value?.status === 'inviting' && me.value?.inviteStatus === 'invited')

const isHost = computed(() => me.value?.role === 'host')

const title = computed(() => (club.value ? clubTitle(club.value) : ''))
const isUserClub = computed(() => club.value?.origin === 'user')
const isRecruiting = computed(() => isUserClub.value && club.value?.status === 'inviting')
const acceptedCount = computed(() => club.value?.members.filter((m) => m.inviteStatus === 'accepted').length ?? 0)
// 정원이 "찼는지"는 초대로 잡아둔 자리까지 세야 서버(clubRecruitService)의 판정과 맞는다.
// 화면에 보여주는 n/capacity는 수락자 기준 그대로(acceptedCount).
const reservedCount = computed(() => club.value?.members.filter((m) => m.inviteStatus === 'accepted' || m.inviteStatus === 'invited').length ?? 0)
const isFull = computed(() => !!club.value && reservedCount.value >= club.value.capacity)
const canJoin = computed(() => isRecruiting.value && (!me.value || me.value.inviteStatus !== 'accepted') && !canRespond.value && (me.value?.inviteStatus === 'invited' || !isFull.value))
const canLeave = computed(() => isRecruiting.value && me.value?.inviteStatus === 'accepted' && me.value.role !== 'host')
const canClose = computed(() => isRecruiting.value && isHost.value)
const recruitDaysLeft = computed(() => {
  const until = club.value?.recruitUntil
  if (!until) return null
  const diff = new Date(until).getTime() - Date.now()
  return diff <= 0 ? 0 : Math.ceil(diff / (24 * 60 * 60 * 1000))
})
const showInvite = ref(false)
const boardCanRead = computed(() => me.value?.inviteStatus === 'accepted')
const boardCanWrite = computed(() => boardCanRead.value && club.value?.status !== 'done' && club.value?.status !== 'canceled')

/** 모임 KST 당일부터는 장소가 잠긴다(서버와 같은 규칙 — shared/utils/clubTime의 placeLocked). */
const placeLocked = computed(() => (club.value ? isPlaceLocked(club.value, new Date()) : false))
const canPickPlace = computed(
  () => isHost.value && (club.value?.status === 'scheduling' || club.value?.status === 'confirmed') && !placeLocked.value
)
/** 상세의 장소는 이름·좌표만 들고 있다 — kakaoMapUrl이 요구하는 Place 꼴로 채운다. */
const placeForMap = computed<Place | null>(() =>
  club.value?.place
    ? { name: club.value.place.name, kakaoId: club.value.place.kakaoId, lat: club.value.place.lat, lng: club.value.place.lng, category: '', address: '', mapx: 0, mapy: 0 }
    : null
)
/** 근거가 하나도 없으면 리뷰 없이 만든 일반 질문이다 — 그 사실을 숨기지 않는다. */
const isGenericAgenda = computed(
  () => (club.value?.agenda.length ?? 0) > 0 && club.value!.agenda.every((a) => a.evidence.length === 0)
)

/**
 * 장소가 아직 없을 때 "어디서" 줄 문구. 진행자가 실제로 고를 수 있는 상태(scheduling·confirmed)
 * 에서만 "진행자가 장소를 고르는 중이에요"를 쓴다 — inviting은 아직 아무도 고르는 중이 아니고,
 * done·canceled는 더 이상 고를 일이 없다.
 */
const wherePlaceholder = computed(() => {
  const status = club.value?.status
  if (status === 'scheduling' || status === 'confirmed') {
    return isHost.value ? '아직 장소를 정하지 않았어요' : '진행자가 장소를 고르는 중이에요'
  }
  if (status === 'inviting') return isUserClub.value ? '모집이 끝나면 정해져요' : '초대 응답이 모이면 정해져요'
  return '정해지지 않았어요'
})

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

async function act(path: string, method: 'POST' | 'DELETE', done: string, confirmText?: string) {
  if (sending.value) return
  if (confirmText && !confirm(confirmText)) return
  sending.value = true
  try {
    await api(`/api/clubs/${clubId.value}/${path}`, { method })
    message.value = done
    await refresh()
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  if (route.query.posts !== undefined) nextTick(() => document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth' }))
})
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
      <h1>{{ title }}</h1>
      <p v-if="isUserClub" class="reason">
        『{{ club.bookTitle }}』 · {{ club.members.find((m) => m.role === 'host')?.userName }} 님이 열었어요
        <template v-if="isRecruiting"> · {{ acceptedCount }}/{{ club.capacity }}명<span v-if="recruitDaysLeft !== null"> · 모집 D-{{ recruitDaysLeft }}</span></template>
      </p>
      <p v-else class="reason">{{ club.matchReason }}</p>
      <p v-if="isUserClub && club.description" class="desc">{{ club.description }}</p>

      <div v-if="isRecruiting" class="recruit">
        <button v-if="canJoin" class="ok-btn slim" :disabled="sending" @click="act('join', 'POST', '참여했어요')">참여하기</button>
        <span v-else-if="me?.inviteStatus !== 'accepted' && isFull" class="note">정원이 찼어요</span>
        <button v-if="canLeave" class="ghost" :disabled="sending" @click="act('join', 'DELETE', '참여를 취소했어요', '참여를 취소할까요?')">참여 취소</button>
        <template v-if="canClose">
          <button class="ghost" :disabled="sending" @click="showInvite = true">초대하기</button>
          <button class="ok-btn slim" :disabled="sending || acceptedCount < 3" :title="acceptedCount < 3 ? '3명이 모여야 시간을 잡을 수 있어요' : ''" @click="act('close-recruiting', 'POST', '모집을 닫고 시간 투표를 시작했어요', '모집을 닫고 시간 투표를 시작할까요?')">모집 마감 → 시간 잡기</button>
          <button class="ghost danger" :disabled="sending" @click="act('withdraw', 'POST', '모임을 접었어요', '모임을 접을까요? 참가자에게 알림이 가요.')">모임 접기</button>
        </template>
      </div>

      <section class="when-where">
        <p><b>언제</b> <template v-if="club.meetAt">{{ formatKst(club.meetAt) }}</template><span v-else class="note">투표로 정해져요</span></p>
        <!-- 외부 장소라 실제 예약이 아니라 "확정"이다(설계서 §2 비목표). -->
        <p>
          <b>어디서</b>
          <template v-if="club.place">
            {{ club.place.name }} <span class="note">(장소 확정)</span>
            <a v-if="placeForMap" class="map-link" :href="kakaoMapUrl(placeForMap, 'map')" target="_blank" rel="noopener">카카오맵</a>
          </template>
          <span v-else class="note">{{ wherePlaceholder }}</span>
        </p>
        <NuxtLink v-if="canPickPlace" class="pick-place" :to="`/places?forClub=${club.id}`">
          {{ club.place ? '장소 바꾸기' : '장소 고르기' }}
        </NuxtLink>
        <p v-else-if="isHost && placeLocked && club.place" class="note">모임 당일에는 장소를 바꿀 수 없어요.</p>
        <button v-if="club.meetAt" type="button" class="ics" @click="downloadIcs">내 캘린더에 추가 (.ics)</button>
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
            <span v-if="m.completed" class="done">완독</span>
            <span v-if="m.inviteStatus === 'accepted'" class="ok">참여</span>
            <span v-else-if="m.inviteStatus === 'declined'" class="no">불참</span>
          </li>
        </ul>
      </section>

      <p v-if="isRecruiting" class="note">모집이 끝나면 참가자 리뷰로 토론 질문을 만들어 드려요.</p>

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

      <ClubPostBoard :club-id="club.id" :can-read="boardCanRead" :can-write="boardCanWrite" :is-host="isHost" />
      <ClubInviteDialog v-if="showInvite" :club-id="club.id" :exclude-ids="club.members.filter((m) => m.inviteStatus !== 'declined').map((m) => m.userId)" @close="showInvite = false" @invited="message = '초대를 보냈어요'; refresh()" />
    </main>
  </div>
</template>

<style scoped>
.wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 60px; }
.back { font-size: 14px; color: var(--muted, #666); text-decoration: none; }
.empty { margin-top: 16px; color: var(--muted, #666); font-size: 14px; }
h1 { font-size: 22px; margin: 10px 0 4px; }
.reason { color: var(--muted, #666); font-size: 14px; margin: 0 0 20px; }
.desc { font-size: 14px; white-space: pre-wrap; margin: 0 0 16px; }
.recruit { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 16px; }
.ghost { background: none; border: 1px solid var(--line, #ddd); border-radius: 8px; padding: 8px 12px; font-size: 14px; cursor: pointer; color: inherit; }
.ghost.danger { color: var(--red); }
.done { color: #1a7f37; margin-left: 5px; }
h2 { font-size: 16px; margin: 24px 0 8px; }
.when-where { background: var(--chip, #f7f7f7); border-radius: 10px; padding: 12px 14px; font-size: 14px; }
.when-where p { margin: 2px 0; }
.note { color: var(--muted, #888); font-size: 13px; }
.pick-place { display: inline-block; margin-top: 8px; padding: 8px 14px; border-radius: 8px; background: var(--red); color: #fff; text-decoration: none; font-size: 14px; }
.map-link { margin-left: 8px; font-size: 13px; color: var(--red); }
.members { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.members li { font-size: 13px; background: var(--chip, #f5f5f5); border-radius: 999px; padding: 4px 11px; }
.dept { color: var(--muted, #888); margin-left: 5px; }
.host { color: var(--red); margin-left: 5px; font-weight: 600; }
.ok { color: #1a7f37; margin-left: 5px; }
.no { color: var(--muted, #999); margin-left: 5px; }
.agenda { padding-left: 20px; }
.agenda .q { margin: 0; font-size: 15px; }
.quote { margin: 4px 0 10px; font-size: 13px; color: var(--muted, #666); }
.msg { font-size: 14px; margin: 16px 0 0; }
.actions { display: flex; gap: 10px; margin-top: 24px; }
.actions button { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--line, #ddd); cursor: pointer; font-size: 15px; }
.ok-btn { background: var(--red); color: #fff; border-color: var(--red); }
.no-btn { background: #fff; }
.vote { background: var(--chip, #f7f7f7); border-radius: 10px; padding: 14px 16px; margin-top: 20px; }
.vote h2 { margin: 0 0 6px; }
.vote .dday { margin-left: 8px; font-size: 13px; color: var(--red); font-weight: 700; }
.slot { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line, #e8e8e8); font-size: 15px; }
.slot:first-of-type { border-top: none; }
.slot-count { margin-left: auto; font-size: 13px; color: var(--muted, #777); }
.ok-btn.slim { width: auto; padding: 9px 16px; margin-top: 10px; font-size: 14px; }
.ics { margin-top: 6px; padding: 6px 12px; border: 1px solid var(--line, #ddd); border-radius: 6px; background: #fff; font-size: 13px; cursor: pointer; }
</style>
