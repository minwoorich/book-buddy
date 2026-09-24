<script setup lang="ts">
import type { ClubPost } from '#shared/types'

const props = defineProps<{ clubId: number; canRead: boolean; canWrite: boolean; isHost: boolean }>()
const api = useApi()
const { user } = useCurrentUser()

const posts = ref<ClubPost[]>([])
const loading = ref(false)
const body = ref('')
const replyTo = ref<number | null>(null)
const replyBody = ref('')
const sending = ref(false)
const message = ref('')

async function load() {
  if (!props.canRead) return
  loading.value = true
  try {
    posts.value = await api<ClubPost[]>(`/api/clubs/${props.clubId}/posts`)
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    loading.value = false
  }
}
watch(() => [props.clubId, props.canRead], load, { immediate: true })

async function submit(parentId: number | null) {
  if (sending.value) return
  const text = (parentId === null ? body.value : replyBody.value).trim()
  if (text.length === 0) return
  sending.value = true
  message.value = ''
  try {
    await api(`/api/clubs/${props.clubId}/posts`, { method: 'POST', body: { body: text, parentId } })
    if (parentId === null) body.value = ''
    else { replyBody.value = ''; replyTo.value = null }
    await load()
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    sending.value = false
  }
}

async function remove(post: ClubPost) {
  if (!confirm('이 글을 지울까요?')) return
  try {
    await api(`/api/clubs/${props.clubId}/posts/${post.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    message.value = apiErrorMessage(e)
  }
}

function canDelete(post: ClubPost): boolean {
  return props.isHost || post.userId === user.value?.id
}
function when(iso: string): string {
  // created_at은 datetime('now') 포맷(UTC, 'YYYY-MM-DD HH:MM:SS') — Z를 붙여 브라우저 로컬로 보인다.
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <section id="posts" class="board">
    <h2>이야기</h2>
    <p v-if="!canRead" class="note">참여하면 이야기를 볼 수 있어요.</p>
    <template v-else>
      <form v-if="canWrite" class="write" @submit.prevent="submit(null)">
        <textarea v-model="body" rows="3" maxlength="2000" placeholder="모임 전에 미리 이야기해요" aria-label="새 글" />
        <button type="submit" :disabled="sending || body.trim().length === 0">올리기</button>
      </form>
      <p v-else class="note">끝난 모임이에요. 읽을 수만 있어요.</p>
      <p v-if="message" class="msg">{{ message }}</p>
      <p v-if="loading && posts.length === 0" class="note">불러오는 중…</p>
      <p v-else-if="posts.length === 0" class="note">아직 글이 없어요.</p>

      <article v-for="p in posts" :key="p.id" class="post">
        <header><strong>{{ p.userName }}</strong><span class="dept">{{ p.department }}</span><span class="time">{{ when(p.createdAt) }}</span>
          <button v-if="canDelete(p)" type="button" class="del" @click="remove(p)">지우기</button>
        </header>
        <p class="body">{{ p.body }}</p>
        <div v-for="r in p.replies" :key="r.id" class="reply">
          <header><strong>{{ r.userName }}</strong><span class="dept">{{ r.department }}</span><span class="time">{{ when(r.createdAt) }}</span>
            <button v-if="canDelete(r)" type="button" class="del" @click="remove(r)">지우기</button>
          </header>
          <p class="body">{{ r.body }}</p>
        </div>
        <template v-if="canWrite">
          <form v-if="replyTo === p.id" class="write reply-form" @submit.prevent="submit(p.id)">
            <input v-model="replyBody" type="text" maxlength="2000" placeholder="댓글" aria-label="댓글" />
            <button type="submit" :disabled="sending || replyBody.trim().length === 0">달기</button>
            <button type="button" class="ghost" @click="replyTo = null; replyBody = ''">취소</button>
          </form>
          <button v-else type="button" class="ghost" @click="replyTo = p.id">댓글</button>
        </template>
      </article>
    </template>
  </section>
</template>

<style scoped>
.board { margin-top: 28px; }
.board h2 { font-size: 16px; margin: 0 0 8px; }
.note { color: var(--muted, #888); font-size: 13px; }
.msg { color: var(--red); font-size: 13px; }
.write { display: flex; gap: 8px; align-items: flex-start; }
.write textarea, .write input { flex: 1; padding: 9px 12px; border: 1px solid var(--line, #ddd); border-radius: 8px; font-size: 14px; background: var(--bg, #fff); color: inherit; resize: vertical; }
.write button { padding: 9px 14px; border: none; border-radius: 8px; background: var(--red); color: #fff; font-size: 14px; cursor: pointer; }
.write button:disabled { opacity: 0.5; cursor: default; }
.post { border-top: 1px solid var(--line, #eee); padding: 12px 0; }
.post header, .reply header { display: flex; align-items: baseline; gap: 6px; font-size: 13px; }
.dept, .time { color: var(--muted, #888); }
.time { margin-left: auto; }
.body { margin: 6px 0 0; font-size: 14px; white-space: pre-wrap; }
.reply { margin: 10px 0 0 16px; padding-left: 10px; border-left: 2px solid var(--line, #eee); }
.reply-form { margin-top: 8px; }
.ghost, .del { background: none; border: none; color: var(--muted, #888); font-size: 13px; cursor: pointer; padding: 4px 0; }
.ghost { margin-top: 6px; }
</style>
