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
      <input v-model="query" type="search" class="input" placeholder="이름이나 부서" aria-label="사람 검색" />
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
.dialog { width: 100%; max-width: 420px; max-height: 80vh; display: flex; flex-direction: column; background: var(--card); color: inherit; border: 1px solid var(--line); border-radius: 4px; padding: 18px 20px; box-shadow: 0 12px 40px var(--shadow-strong); }
header { display: flex; align-items: center; justify-content: space-between; }
h3 { margin: 0; font-size: 16px; }
.x { background: none; border: none; font-size: 22px; cursor: pointer; color: inherit; }
.input { margin: 12px 0 8px; box-sizing: border-box; }
.people { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
.people li { padding: 6px 2px; font-size: 14px; }
.dept { color: var(--muted, #888); font-size: 13px; margin-left: 4px; }
.msg { font-size: 13px; color: var(--red); margin: 8px 0 0; }
.send { margin-top: 12px; padding: 10px; border: 1px solid var(--red); border-radius: 3px; background: var(--red); color: #fff; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
.send:hover:not(:disabled) { background: var(--red-dark); }
.send:disabled { opacity: 0.5; cursor: default; }
</style>
