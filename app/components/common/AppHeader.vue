<script setup lang="ts">
const props = defineProps<{ active: string }>()

const { user, logout } = useCurrentUser()

const ALL_NAV_ITEMS = [
  { key: 'home', label: '홈', to: '/' },
  { key: 'my', label: '내 서재', to: '/my' },
  { key: 'calendar', label: '도서 달력', to: '/calendar' },
  { key: 'rankings', label: '랭킹', to: '/rankings' },
  { key: 'reviews', label: '리뷰', to: '/reviews' },
  { key: 'feed', label: '피드', to: '/feed' },
  { key: 'places', label: '장소', to: '/places' },
]

// 비로그인 상태에서는 보호된 메뉴(홈 제외 5개)를 숨긴다 — 클릭해도 가드에 막혀 로그인으로
// 튕겨나가는 것보다, 애초에 보이지 않는 편이 게스트 경험상 자연스럽다.
const navItems = computed(() => (user.value ? ALL_NAV_ITEMS : ALL_NAV_ITEMS.filter((item) => item.key === 'home')))

const activeKey = computed(() => props.active)

async function handleLogout() {
  logout()
  await navigateTo('/login')
}
</script>

<template>
  <nav class="nav">
    <div class="nav-in">
      <NuxtLink class="logo" to="/" style="color:inherit;">
        <div class="logo-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M3 5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0V5z"></path><line x1="12" y1="5" x2="12" y2="19"></line></svg>
        </div>
        <div><b>道, 서관</b><span>VATECH LIBRARY</span></div>
      </NuxtLink>
      <div class="nav-links">
        <NuxtLink
          v-for="item in navItems"
          :key="item.key"
          :class="{ on: item.key === activeKey }"
          :to="item.to"
        >{{ item.label }}</NuxtLink>
        <NuxtLink v-if="user?.role === 'admin'" :class="{ on: activeKey === 'admin' }" to="/admin">관리자</NuxtLink>
      </div>
      <div v-if="user" class="me-zone">
        <NuxtLink class="me" to="/my" title="마이페이지로 이동">
          <div class="avatar">{{ user.name.charAt(0) }}</div> {{ user.name }} 님
        </NuxtLink>
        <button type="button" class="logout" title="로그아웃" @click="handleLogout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        </button>
      </div>
      <div v-else class="guest-actions">
        <NuxtLink to="/signup" class="signup-link">회원가입</NuxtLink>
        <NuxtLink to="/login" class="btn primary sm">로그인</NuxtLink>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.guest-actions { display: flex; align-items: center; gap: 14px; }
.signup-link { font-size: 13px; color: var(--sub); }
.me-zone { display: flex; align-items: center; gap: 10px; }
.me-zone .me { color: inherit; text-decoration: none; }
.logout {
  display: flex; align-items: center; justify-content: center;
  background: none; border: 0; cursor: pointer; padding: 4px;
  color: var(--sub);
}
.logout:hover { color: var(--red); }
</style>
