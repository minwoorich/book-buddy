<script setup lang="ts">
import type { ClubMessage } from '#shared/types'
import { formatKst, formatKstTime, kstParts } from '#shared/utils/clubTime'

const props = defineProps<{ clubId: number; canRead: boolean; canWrite: boolean }>()
const api = useApi()
const { user, guestToken } = useCurrentUser()

const messages = ref<ClubMessage[]>([])
const draft = ref('')
const sending = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const connected = ref(false)
const error = ref('')
const bodyEl = ref<HTMLElement | null>(null)
let es: EventSource | null = null
let hadError = false   // error 뒤의 open(재접속)에서만 공백을 보충한다 — 첫 open은 loadInitial이 이미 채웠다

function sameKstDay(a: string, b: string): boolean {
  const p = kstParts(toDate(a)), q = kstParts(toDate(b))
  return p.y === q.y && p.m === q.m && p.d === q.d
}
/** created_at은 SQLite 'YYYY-MM-DD HH:MM:SS'(UTC) — Z를 붙여 Date로. */
function toDate(s: string): Date { return new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`) }
function when(m: ClubMessage): string {
  const iso = toDate(m.createdAt).toISOString()
  return sameKstDay(iso, new Date().toISOString()) ? formatKstTime(iso) : formatKst(iso)
}
function dayLabel(iso: string): string { return formatKst(toDate(iso).toISOString()).split(' ')[0]! }
function showDay(i: number): boolean { return i === 0 || !sameKstDay(messages.value[i - 1]!.createdAt, messages.value[i]!.createdAt) }

async function scrollBottom() { await nextTick(); if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight }
async function markRead() {
  const last = messages.value.at(-1)
  if (!last || !props.canRead) return
  try { await api(`/api/clubs/${props.clubId}/messages/read`, { method: 'POST', body: { lastReadId: last.id } }) } catch { /* 읽음은 실패해도 조용히 */ }
}
function push(m: ClubMessage) {
  if (messages.value.some((x) => x.id === m.id)) return
  messages.value.push(m)
  void scrollBottom()
  if (document.visibilityState === 'visible') void markRead()
}

async function loadInitial() {
  if (!props.canRead) return
  try {
    messages.value = await api<ClubMessage[]>(`/api/clubs/${props.clubId}/messages`)
    hasMore.value = messages.value.length >= 50
    await scrollBottom()
    await markRead()
  } catch (e) { error.value = apiErrorMessage(e) }
}
async function loadMore() {
  const first = messages.value[0]
  if (!first || loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  const el = bodyEl.value; const before = el ? el.scrollHeight : 0
  try {
    const older = await api<ClubMessage[]>(`/api/clubs/${props.clubId}/messages`, { query: { before: first.id } })
    hasMore.value = older.length >= 50
    messages.value = [...older, ...messages.value]
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - before   // 보던 자리 유지
  } catch (e) { error.value = apiErrorMessage(e) } finally { loadingMore.value = false }
}
function onScroll() { if (bodyEl.value && bodyEl.value.scrollTop < 40) void loadMore() }

/** 재접속 뒤 끊긴 동안의 메시지를 최신 50개로 메워 넣는다(push가 id로 dedup). */
async function fillGap() {
  try {
    const latest = await api<ClubMessage[]>(`/api/clubs/${props.clubId}/messages`)
    for (const m of latest) push(m)
  } catch { /* 실패해도 조용히 — 다음 메시지부터는 스트림으로 이어진다 */ }
}
function connect() {
  if (!props.canRead || !user.value || es) return
  const q = new URLSearchParams({ userId: String(user.value.id) })
  if (guestToken.value) q.set('guestToken', guestToken.value)
  es = new EventSource(`/api/clubs/${props.clubId}/stream?${q}`)
  es.addEventListener('open', () => {
    connected.value = true
    if (hadError) { hadError = false; void fillGap() }
  })
  es.addEventListener('message', (e) => push(JSON.parse((e as MessageEvent).data) as ClubMessage))
  es.addEventListener('error', () => { connected.value = false; hadError = true })   // EventSource가 스스로 재접속한다
}
function disconnect() { es?.close(); es = null; connected.value = false; hadError = false }

async function send() {
  const text = draft.value.trim()
  if (sending.value || text.length === 0) return
  sending.value = true
  error.value = ''
  try {
    const m = await api<ClubMessage>(`/api/clubs/${props.clubId}/messages`, { method: 'POST', body: { body: text } })
    draft.value = ''
    push(m)   // 스트림으로도 오지만 먼저 그린다(중복은 id로 거른다)
  } catch (e) { error.value = apiErrorMessage(e) } finally { sending.value = false }
}
function onKey(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send() } }

// 부모([id].vue)가 :key="club.id"로 모임마다 이 컴포넌트를 새로 마운트한다 — clubId prop이 바뀌는 걸
// 여기서 직접 감시할 필요가 없다(마운트 시점에 한 번만 연결하면 됨).
onMounted(async () => { await loadInitial(); connect(); document.addEventListener('visibilitychange', markRead) })
onBeforeUnmount(() => { disconnect(); document.removeEventListener('visibilitychange', markRead) })
watch(() => props.canRead, async (v) => { if (v) { await loadInitial(); connect() } else disconnect() })
</script>

<template>
  <section class="chat panel" aria-label="이야기">
    <header class="chat-head">
      <h2>이야기</h2>
      <span class="dot" :class="{ on: connected }" :title="connected ? '실시간 연결됨' : '연결 중'" />
    </header>
    <p v-if="!canRead" class="note">참여하면 이야기를 볼 수 있어요.</p>
    <template v-else>
      <div ref="bodyEl" class="chat-body" @scroll="onScroll">
        <p v-if="loadingMore" class="note center">불러오는 중…</p>
        <p v-else-if="messages.length === 0" class="note center">아직 이야기가 없어요. 먼저 인사해 보세요.</p>
        <template v-for="(m, i) in messages" :key="m.id">
          <div v-if="showDay(i)" class="day">{{ dayLabel(m.createdAt) }}</div>
          <div v-if="m.kind === 'system'" class="sys">{{ m.body }}</div>
          <div v-else class="msg" :class="{ mine: m.userId === user?.id }">
            <div v-if="m.userId !== user?.id" class="who">{{ m.userName }}<span class="dept">{{ m.department }}</span></div>
            <div class="bubble">{{ m.body }}</div>
            <div class="time">{{ when(m) }}</div>
          </div>
        </template>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <form v-if="canWrite" class="chat-foot" @submit.prevent="send">
        <textarea v-model="draft" class="input" rows="1" maxlength="500" placeholder="메시지 (Enter 전송, Shift+Enter 줄바꿈)" aria-label="메시지" @keydown="onKey" />
        <button type="submit" class="btn primary" :disabled="sending || draft.trim().length === 0">보내기</button>
      </form>
      <p v-else class="note">끝난 모임이에요. 읽을 수만 있어요.</p>
    </template>
  </section>
</template>

<style scoped>
.chat { display: flex; flex-direction: column; padding: 0; overflow: hidden; height: 100%; min-height: 420px; }
.chat-head { display: flex; align-items: center; gap: 8px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.chat-head h2 { margin: 0; font-size: 15px; font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); margin-left: auto; }
.dot.on { background: var(--ok); }
.chat-body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.day { align-self: center; font-size: 11.5px; letter-spacing: 1px; color: var(--muted); margin: 6px 0 2px; }
.sys { align-self: center; font-size: 12.5px; color: var(--sub); background: var(--card-2); border-radius: 999px; padding: 4px 12px; }
.msg { display: flex; flex-direction: column; max-width: 82%; align-self: flex-start; }
.msg.mine { align-self: flex-end; align-items: flex-end; }
.who { font-size: 12px; color: var(--sub); margin-bottom: 3px; }
.dept { margin-left: 4px; color: var(--muted); }
.bubble { font-size: 14px; line-height: 1.5; padding: 8px 12px; border-radius: 12px 12px 12px 3px; background: var(--card-2); border: 1px solid var(--line); white-space: pre-wrap; word-break: break-word; }
.mine .bubble { background: var(--red-tint); border-color: transparent; color: var(--red-text); border-radius: 12px 12px 3px 12px; }
.time { font-size: 11px; color: var(--muted); margin-top: 3px; }
.chat-foot { display: flex; gap: 8px; align-items: flex-end; padding: 12px 14px; border-top: 1px solid var(--line); }
.chat-foot .input { flex: 1; width: auto; min-width: 0; box-sizing: border-box; resize: none; line-height: 1.45; max-height: 120px; }
.chat-foot .btn { flex: none; }
.note { margin: 0; padding: 14px 18px; font-size: 13px; color: var(--sub); }
.note.center { padding: 0; text-align: center; }
.err { margin: 0; padding: 0 16px 8px; font-size: 13px; color: var(--red); }
</style>
