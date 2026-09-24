<script setup lang="ts">
import type { User } from '#shared/types'

const props = defineProps<{ clubId: number; excludeIds: number[] }>()
const emit = defineEmits<{ close: []; invited: [] }>()
const api = useApi()

const users = ref<User[]>([])
const query = ref('')
const picked = ref<number[]>([])
const sending = ref(false)
const message = ref('')

onMounted(async () => {
  try {
    users.value = (await api<User[]>('/api/users')).filter((u) => !u.isGuest && !props.excludeIds.includes(u.id))
  } catch (e) {
    message.value = apiErrorMessage(e)
  }
})

const shown = computed(() => {
  const q = query.value.trim()
  const list = q ? users.value.filter((u) => u.name.includes(q) || u.department.includes(q)) : users.value
  return list.slice(0, 30)
})

async function send() {
  if (sending.value || picked.value.length === 0) return
  sending.value = true
  try {
    await api(`/api/clubs/${props.clubId}/invite`, { method: 'POST', body: { userIds: picked.value } })
    emit('invited')
    emit('close')
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="초대하기">
      <header><h3>초대하기</h3><button type="button" class="x" aria-label="닫기" @click="emit('close')">×</button></header>
      <input v-model="query" type="search" placeholder="이름이나 부서" aria-label="사람 검색" />
      <ul class="people">
        <li v-for="u in shown" :key="u.id">
          <label><input v-model="picked" type="checkbox" :value="u.id" /> {{ u.name }} <span class="dept">{{ u.department }}</span></label>
        </li>
      </ul>
      <p v-if="message" class="msg">{{ message }}</p>
      <button type="button" class="send" :disabled="sending || picked.length === 0" @click="send">{{ picked.length }}명 초대</button>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
.dialog { width: 100%; max-width: 420px; max-height: 80vh; display: flex; flex-direction: column; background: var(--bg, #fff); color: inherit; border-radius: 12px; padding: 16px; }
header { display: flex; align-items: center; justify-content: space-between; }
h3 { margin: 0; font-size: 16px; }
.x { background: none; border: none; font-size: 22px; cursor: pointer; color: inherit; }
input[type="search"] { margin: 10px 0; padding: 9px 12px; border: 1px solid var(--line, #ddd); border-radius: 8px; font-size: 14px; background: var(--bg, #fff); color: inherit; }
.people { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
.people li { padding: 6px 2px; font-size: 14px; }
.dept { color: var(--muted, #888); font-size: 13px; margin-left: 4px; }
.msg { font-size: 13px; color: var(--red); margin: 8px 0 0; }
.send { margin-top: 10px; padding: 10px; border: none; border-radius: 8px; background: var(--red); color: #fff; font-size: 14px; cursor: pointer; }
.send:disabled { opacity: 0.5; cursor: default; }
</style>
