<script setup lang="ts">
import type { Notice } from '#shared/types'

const api = useApi()
const { user } = useCurrentUser()

const isAdmin = computed(() => user.value?.role === 'admin')

const { data: notices, refresh } = await useAsyncData<Notice[]>(
  'notices',
  () => (user.value ? api<Notice[]>('/api/notices') : Promise.resolve([])),
  { default: () => [] }
)

// ── 펼치기: 목록은 제목만, 클릭하면 본문이 펼쳐진다. 고정 공지는 처음부터 펼쳐 둔다. ──
const openIds = ref<Set<number>>(new Set())
watch(
  notices,
  (list) => {
    list.filter((n) => n.pinned).forEach((n) => openIds.value.add(n.id))
  },
  { immediate: true }
)

function toggleOpen(id: number) {
  if (openIds.value.has(id)) openIds.value.delete(id)
  else openIds.value.add(id)
  openIds.value = new Set(openIds.value)
}

function formatDate(iso: string): string {
  const d = parseDbDate(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

// ── 관리자 작성·수정(QA #55): 관리자만 폼이 보인다. editingId가 있으면 수정 모드. ──
const composerOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ title: '', content: '', pinned: false })
const busy = ref(false)

function openComposer() {
  editingId.value = null
  form.title = ''
  form.content = ''
  form.pinned = false
  composerOpen.value = true
}

function startEdit(notice: Notice) {
  editingId.value = notice.id
  form.title = notice.title
  form.content = notice.content
  form.pinned = notice.pinned
  composerOpen.value = true
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

function closeComposer() {
  composerOpen.value = false
  editingId.value = null
}

async function submit() {
  if (busy.value) return
  if (!form.title.trim() || !form.content.trim()) {
    alert('제목과 내용을 모두 입력해주세요')
    return
  }
  busy.value = true
  try {
    const body = { title: form.title, content: form.content, pinned: form.pinned }
    if (editingId.value === null) {
      await api('/api/notices', { method: 'POST', body })
    } else {
      await api(`/api/notices/${editingId.value}`, { method: 'PATCH', body })
    }
    closeComposer()
    await refresh()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busy.value = false
  }
}

async function remove(notice: Notice) {
  if (!confirm(`"${notice.title}" 공지를 삭제할까요?`)) return
  try {
    await api(`/api/notices/${notice.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    alert(apiErrorMessage(e))
  }
}
</script>

<template>
  <div>
    <CommonAppHeader active="notices" />
    <div class="wrap">
      <div class="head-row">
        <div class="page-head" style="margin-bottom:0;">
          <span class="eyebrow">NOTICE</span>
          <h1>공지사항</h1>
          <p>도서관 운영 소식과 안내를 모아뒀어요</p>
        </div>
        <button v-if="isAdmin && !composerOpen" type="button" class="btn primary" style="margin-left:auto;" @click="openComposer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-1px; margin-right:5px;"><line x1="12" y1="4" x2="12" y2="20" /><line x1="4" y1="12" x2="20" y2="12" /></svg>
          공지 쓰기
        </button>
      </div>

      <div v-if="isAdmin && composerOpen" class="panel accent composer">
        <div class="composer-head">
          <b>{{ editingId === null ? '새 공지' : '공지 수정' }}</b>
          <label class="pin-toggle">
            <input v-model="form.pinned" type="checkbox"> 상단 고정
          </label>
        </div>
        <input v-model="form.title" class="input" placeholder="제목" maxlength="100" @keyup.enter="submit">
        <textarea v-model="form.content" class="input" rows="6" placeholder="내용을 입력하세요 (줄바꿈 그대로 표시돼요)" maxlength="5000" />
        <div class="composer-acts">
          <button type="button" class="btn" :disabled="busy" @click="closeComposer">취소</button>
          <button type="button" class="btn primary" :disabled="busy" @click="submit">
            {{ busy ? '저장 중…' : editingId === null ? '등록' : '저장' }}
          </button>
        </div>
      </div>

      <p v-if="!notices.length" class="hint">아직 등록된 공지가 없어요.</p>
      <div v-else class="list">
        <article v-for="n in notices" :key="n.id" class="notice" :class="{ pinned: n.pinned, open: openIds.has(n.id) }">
          <button type="button" class="row" :aria-expanded="openIds.has(n.id)" @click="toggleOpen(n.id)">
            <span v-if="n.pinned" class="badge red">고정</span>
            <span class="title">{{ n.title }}</span>
            <span class="meta">{{ n.authorName }} · {{ formatDate(n.createdAt) }}</span>
            <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <div v-if="openIds.has(n.id)" class="body">
            <p class="content">{{ n.content }}</p>
            <div v-if="isAdmin" class="admin-acts">
              <button type="button" class="mini-act" @click="startEdit(n)">수정</button>
              <button type="button" class="mini-act danger" @click="remove(n)">삭제</button>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-end; margin-bottom: 26px; }

.composer { display: flex; flex-direction: column; gap: 10px; margin-bottom: 26px; }
.composer-head { display: flex; align-items: center; gap: 14px; }
.composer-head b { font-size: 15px; }
.pin-toggle { margin-left: auto; font-size: 13px; color: var(--sub); display: flex; align-items: center; gap: 6px; cursor: pointer; }
.composer textarea { resize: vertical; line-height: 1.6; }
.composer-acts { display: flex; justify-content: flex-end; gap: 8px; }

.list { display: flex; flex-direction: column; gap: 10px; }
.notice { background: var(--card); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 2px 10px var(--shadow); overflow: hidden; }
.notice.pinned { border-color: var(--red-soft); }
.row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 15px 18px; border: 0; background: none; font: inherit; color: var(--ink); text-align: left; cursor: pointer; }
.row:hover { background: var(--card-2); }
.title { font-size: 15.5px; font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { font-size: 12.5px; color: var(--sub); white-space: nowrap; }
.chev { color: var(--sub); flex-shrink: 0; transition: transform .18s; }
.notice.open .chev { transform: rotate(180deg); }
.body { border-top: 1px solid var(--line); padding: 16px 18px 14px; }
.content { margin: 0; font-size: 14.5px; line-height: 1.75; white-space: pre-line; word-break: keep-all; }
.admin-acts { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.mini-act { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--sub); cursor: pointer; }
.mini-act:hover { color: var(--ink); }
.mini-act.danger:hover { color: var(--red); }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 640px) {
  .head-row { flex-direction: column; align-items: flex-start; gap: 12px; }
  .head-row .btn { margin-left: 0 !important; }
  .row { flex-wrap: wrap; gap: 6px 10px; padding: 13px 14px; }
  .title { flex-basis: calc(100% - 30px); white-space: normal; }
  .meta { flex: 1; }
  .body { padding: 14px; }
}
</style>
