<script setup lang="ts">
import type { Club } from '#shared/types'
import { formatKst } from '#shared/utils/clubTime'

const props = defineProps<{ club: Club }>()
const emit = defineEmits<{ close: []; confirmed: [] }>()
const api = useApi()

const now = Date.now()
const rows = computed(() =>
  props.club.candidateSlots.map((slot, i) => ({ slot, count: props.club.votes.filter((v) => v.slotIdx === i).length, past: new Date(slot).getTime() <= now }))
)
const max = computed(() => Math.max(1, ...rows.value.map((r) => r.count)))
const best = computed(() => rows.value.find((r) => !r.past && r.count === Math.max(...rows.value.filter((x) => !x.past).map((x) => x.count)))?.slot ?? null)
const picked = ref<string | null>(best.value)
const sending = ref(false)
const error = ref('')
const acceptedCount = computed(() => props.club.members.filter((m) => m.inviteStatus === 'accepted').length)

async function confirm() {
  if (!picked.value || sending.value) return
  sending.value = true
  error.value = ''
  try {
    await api(`/api/clubs/${props.club.id}/confirm`, { method: 'POST', body: { slot: picked.value } })
    emit('confirmed'); emit('close')
  } catch (e) { error.value = apiErrorMessage(e) } finally { sending.value = false }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog panel" role="dialog" aria-label="시간 확정">
      <h3>시간을 정할게요</h3>
      <p class="sub">참가자 {{ acceptedCount }}명 · 가장 많이 고른 시간이 골라져 있어요. 다른 시간으로 정할 수도 있어요.</p>
      <label v-for="r in rows" :key="r.slot" class="row" :class="{ past: r.past }">
        <input v-model="picked" type="radio" name="slot" :value="r.slot" :disabled="r.past" />
        <span class="slot">{{ formatKst(r.slot) }}<span v-if="r.past" class="pastTag">지남</span></span>
        <span class="bar"><span class="fill" :class="{ top: r.slot === best }" :style="{ width: `${(r.count / max) * 100}%` }" /></span>
        <span class="count">{{ r.count }}명</span>
      </label>
      <p v-if="error" class="err">{{ error }}</p>
      <div class="acts">
        <button type="button" class="btn" @click="emit('close')">닫기</button>
        <button type="button" class="btn primary" :disabled="!picked || sending" @click="confirm">{{ sending ? '정하는 중…' : '이 시간으로 확정' }}</button>
      </div>
      <p class="note">확정하면 모집이 닫히고 참가자에게 알림이 가요. 자리가 남으면 모임 전날까지 더 들어올 수 있어요.</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: var(--overlay); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
.dialog { width: 100%; max-width: 460px; }
h3 { margin: 0 0 6px; font-size: 17px; }
.sub { margin: 0 0 14px; font-size: 13.5px; color: var(--sub); }
.row { display: grid; grid-template-columns: auto 1fr 120px 40px; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 14px; cursor: pointer; }
.row.past { color: var(--muted); cursor: default; }
.pastTag { margin-left: 6px; font-size: 11.5px; color: var(--muted); }
.bar { height: 6px; background: var(--bar-track); border-radius: 3px; overflow: hidden; }
.fill { display: block; height: 100%; background: var(--bar-fill); }
.fill.top { background: var(--red); }
.count { text-align: right; font-size: 13px; color: var(--sub); }
.err { margin: 8px 0 0; font-size: 13px; color: var(--red); }
.acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.note { margin: 12px 0 0; font-size: 12.5px; color: var(--muted); }
@media (max-width: 480px) { .row { grid-template-columns: auto 1fr 40px; } .bar { display: none; } }
</style>
