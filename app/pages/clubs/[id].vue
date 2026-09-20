<script setup lang="ts">
import type { Club } from '#shared/types'

const api = useApi()
const route = useRoute()
const { user } = useCurrentUser()

const clubId = computed(() => Number(route.params.id))
const { data: club, refresh } = await useAsyncData<Club | null>(
  () => `club-${clubId.value}`,
  () => api<Club>(`/api/clubs/${clubId.value}`),
  { default: () => null }
)

const message = ref('')
const sending = ref(false)

const me = computed(() => club.value?.members.find((m) => m.userId === user.value?.id))
const canRespond = computed(() => club.value?.status === 'inviting' && me.value?.inviteStatus === 'invited')
/** 근거가 하나도 없으면 리뷰 없이 만든 일반 질문이다 — 그 사실을 숨기지 않는다. */
const isGenericAgenda = computed(
  () => (club.value?.agenda.length ?? 0) > 0 && club.value!.agenda.every((a) => a.evidence.length === 0)
)

async function respond(accept: boolean) {
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
    <main v-if="club" class="wrap">
      <NuxtLink class="back" to="/clubs">← 책모임</NuxtLink>
      <h1>『{{ club.bookTitle }}』 책모임</h1>
      <p class="reason">{{ club.matchReason }}</p>

      <section v-if="club.meetAt || club.place" class="when-where">
        <p v-if="club.meetAt"><b>언제</b> {{ club.meetAt }}</p>
        <!-- 외부 장소라 실제 예약이 아니라 "확정"이다(설계서 §2 비목표). -->
        <p v-if="club.place"><b>어디서</b> {{ club.place.name }} <span class="note">(장소 확정)</span></p>
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
</style>
