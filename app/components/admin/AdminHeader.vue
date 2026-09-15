<script setup lang="ts">
const props = defineProps<{ active: 'dashboard' | 'stats' | 'qa' | 'ai' }>()

const { user } = useCurrentUser()

const navItems = [
  { key: 'dashboard', label: '대시보드', to: '/admin' },
  { key: 'stats', label: '통계', to: '/admin/stats' },
  { key: 'qa', label: 'QA', to: '/admin/qa' },
  { key: 'ai', label: 'AI', to: '/admin/ai' },
] as const

const activeKey = computed(() => props.active)
</script>

<template>
  <nav class="nav">
    <div class="nav-in">
      <NuxtLink class="logo" to="/admin" style="color:inherit;">
        <div class="logo-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M3 5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0V5z"></path><line x1="12" y1="5" x2="12" y2="19"></line></svg>
        </div>
        <div><b>道, 서관</b><span>ADMIN CONSOLE</span></div>
      </NuxtLink>
      <div class="nav-links">
        <NuxtLink
          v-for="item in navItems"
          :key="item.key"
          :class="{ on: item.key === activeKey }"
          :to="item.to"
        >{{ item.label }}</NuxtLink>
      </div>
      <div class="me">
        <span class="badge red">관리자</span>
        <div class="avatar">{{ user?.name?.charAt(0) ?? '관' }}</div> <span class="me-name">{{ user?.name ?? '관리자' }}</span>
        <NuxtLink to="/" class="to-user">사용자 화면 →</NuxtLink>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.to-user { font-size: 12.5px; margin-left: 10px; }

@media (max-width: 640px) {
  .me { gap: 6px; }
  .to-user { display: none; }
}
@media (max-width: 420px) {
  .me-name { display: none; }
}
</style>
