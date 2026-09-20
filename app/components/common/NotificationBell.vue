<script setup lang="ts">
import type { AppNotification } from '#shared/types'

const api = useApi()
const { user } = useCurrentUser()

const items = ref<AppNotification[]>([])
const unread = ref(0)
const open = ref(false)

/** 폴링 간격. 외부 푸시 인프라가 없으므로 앱 내 폴링으로 대신한다. */
const POLL_MS = 60_000
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  if (!user.value) return
  try {
    const res = await api<{ items: AppNotification[]; unread: number }>('/api/notifications')
    items.value = res.items
    unread.value = res.unread
  } catch {
    // 알림은 보조 기능이다 — 실패해도 화면을 방해하지 않는다.
  }
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await load()
  if (unread.value === 0) return
  try {
    const res = await api<{ unread: number }>('/api/notifications/read', { method: 'POST', body: {} })
    unread.value = res.unread
    items.value = items.value.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
  } catch {
    // 읽음 처리 실패는 다음 폴링에서 회복된다.
  }
}

function onFocus() {
  void load()
}

onMounted(() => {
  void load()
  timer = setInterval(load, POLL_MS)
  window.addEventListener('focus', onFocus)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('focus', onFocus)
})
</script>

<template>
  <div v-if="user" class="bell-wrap">
    <button class="bell" :aria-label="`알림 ${unread}건`" @click="toggle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      <span v-if="unread > 0" class="unread-count">{{ unread > 9 ? '9+' : unread }}</span>
    </button>

    <div v-if="open" class="panel">
      <p v-if="items.length === 0" class="empty">새 알림이 없어요.</p>
      <NuxtLink
        v-for="n in items"
        :key="n.id"
        class="item"
        :class="{ unread: !n.readAt }"
        :to="n.link ?? '/'"
        @click="open = false"
      >
        <strong>{{ n.title }}</strong>
        <span v-if="n.body">{{ n.body }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.bell-wrap { position: relative; }
.bell { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; color: inherit; cursor: pointer; }
.unread-count { position: absolute; top: 1px; right: 0; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 999px; background: #e60012; color: #fff; font-size: 10px; line-height: 15px; font-weight: 700; }
.panel { position: absolute; right: 0; top: 38px; width: 280px; max-height: 360px; overflow-y: auto; background: var(--bg, #fff); border: 1px solid var(--line, #e5e5e5); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 12%); z-index: 50; }
.empty { padding: 16px; margin: 0; font-size: 13px; color: var(--muted, #888); }
.item { display: block; padding: 10px 13px; border-bottom: 1px solid var(--line, #f0f0f0); text-decoration: none; color: inherit; }
.item:last-child { border-bottom: none; }
.item.unread { background: var(--chip, #fafafa); }
.item strong { display: block; font-size: 13px; }
.item span { display: block; margin-top: 2px; font-size: 12px; color: var(--muted, #777); }
@media (max-width: 640px) {
  .panel { width: calc(100vw - 32px); right: -8px; }
}
</style>
