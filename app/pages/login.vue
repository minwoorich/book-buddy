<script setup lang="ts">
import type { User } from '#shared/types'

type GuestSlot = User & { claimed: boolean }

const api = useApi()
const { login } = useCurrentUser()

// 시연용 게스트 슬롯. 게스트 계정이 DB에 없으면 빈 배열이라 이 섹션은 아예 렌더되지 않는다.
// 3초마다 다시 불러와 다른 사람이 고른 자리가 곧바로 "사용 중"으로 바뀐다.
const guests = ref<GuestSlot[]>([])
const guestError = ref('')
const claiming = ref<number | null>(null)

async function loadGuests() {
  try {
    guests.value = await api<GuestSlot[]>('/api/guests')
  } catch {
    // 목록 조회 실패는 조용히 넘기고 다음 주기에 다시 시도한다.
  }
}

async function pickGuest(guest: GuestSlot) {
  if (guest.claimed || claiming.value !== null) return
  guestError.value = ''
  claiming.value = guest.id
  try {
    const { user, token } = await api<{ user: User; token: string }>(`/api/guests/${guest.id}/claim`, { method: 'POST' })
    login(user, token)
    await navigateTo('/')
  } catch (e) {
    guestError.value = apiErrorMessage(e)
    await loadGuests()
  } finally {
    claiming.value = null
  }
}

let guestTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void loadGuests()
  guestTimer = setInterval(() => void loadGuests(), 3000)
})
onBeforeUnmount(() => clearInterval(guestTimer))

const name = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    const user = await api<User>('/api/auth/login', {
      method: 'POST',
      body: { name: name.value, password: password.value },
    })
    login(user)
    await navigateTo(user.role === 'admin' ? '/admin' : '/')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="a11y-corner"><CommonThemeToggle /><CommonA11yMenu /></div>
    <div class="logo-big">
      <div class="logo-mark">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M3 5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0V5z"></path><line x1="12" y1="5" x2="12" y2="19"></line></svg>
      </div>
      <div><b>道, 서관</b><span>VATECH LIBRARY</span></div>
    </div>

    <div v-if="guests.length" class="panel guest-panel">
      <div class="guest-head">
        <span class="eyebrow">GUEST</span>
        <h2>게스트로 바로 시작</h2>
        <p>회원가입 없이 한 명당 하나씩 골라 주세요. 다른 분이 고른 자리는 비활성화됩니다.</p>
      </div>
      <div class="guest-grid">
        <button
          v-for="g in guests"
          :key="g.id"
          type="button"
          class="guest-card"
          :class="{ taken: g.claimed, busy: claiming === g.id }"
          :disabled="g.claimed || claiming !== null"
          @click="pickGuest(g)"
        >
          <span class="guest-avatar">{{ g.name.replace(/\D/g, '') || g.name.charAt(0) }}</span>
          <b>{{ g.name }}</b>
          <span class="guest-state">{{ g.claimed ? '사용 중' : claiming === g.id ? '입장 중...' : '바로 입장' }}</span>
        </button>
      </div>
      <p v-if="guestError" class="error">{{ guestError }}</p>
    </div>

    <div class="panel login-panel">
      <h1>어서 오세요</h1>
      <div class="sub">이름과 비밀번호로 로그인하세요</div>

      <form class="login-form" @submit.prevent="submit">
        <input v-model="name" type="text" class="input" placeholder="이름" autofocus autocomplete="username">
        <input v-model="password" type="password" class="input" placeholder="비밀번호" autocomplete="current-password">
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn primary login-btn" :disabled="loading">
          {{ loading ? '로그인 중...' : '로그인' }}
        </button>
      </form>

      <div class="switch">
        처음이신가요? <NuxtLink to="/signup">회원가입</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrap { max-width: 420px; margin: 0 auto; padding: 70px 24px 90px; text-align: center; position: relative; }
.a11y-corner { position: absolute; top: 16px; right: 16px; display: flex; align-items: center; gap: 10px; }
.logo-big { display: inline-flex; align-items: center; gap: 12px; margin-bottom: 26px; }
.logo-big .logo-mark { width: 44px; height: 44px; border-radius: 10px; }
.logo-big b { font-family: var(--font-serif); font-size: 26px; display: block; text-align: left; }
.logo-big span { font-size: 11px; color: var(--sub); letter-spacing: 2.6px; display: block; text-align: left; margin-top: 2px; }

.guest-panel { text-align: left; padding: 22px 22px 20px; margin-bottom: 16px; }
.guest-head h2 { font-family: var(--font-display); font-size: 19px; font-weight: 600; margin: 4px 0 6px; }
.guest-head p { color: var(--sub); font-size: 13px; margin: 0 0 16px; line-height: 1.5; }
.guest-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.guest-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 8px 12px; border-radius: 6px; cursor: pointer;
  background: var(--card-2); border: 1px solid var(--line); color: inherit; font: inherit;
  transition: border-color .15s, transform .15s;
}
.guest-card:hover:not(:disabled) { border-color: var(--red); transform: translateY(-1px); }
.guest-card b { font-size: 13.5px; }
.guest-avatar {
  width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
  background: var(--ink, #222); color: #fff; font-weight: 700; font-size: 15px;
}
.guest-state { font-size: 11.5px; color: var(--red); font-weight: 600; }
.guest-card.taken { cursor: not-allowed; opacity: .45; }
.guest-card.taken .guest-avatar { background: var(--sub); }
.guest-card.taken .guest-state { color: var(--sub); }
.guest-card.busy { opacity: .7; }
.guest-panel .error { margin-top: 12px; }

.login-panel { text-align: center; padding: 32px 28px 30px; }
h1 { font-family: var(--font-display); font-size: 24px; font-weight: 600; margin: 0 0 8px; }
.sub { color: var(--sub); font-size: 14.5px; margin-bottom: 28px; }

.login-form { display: flex; flex-direction: column; gap: 12px; text-align: left; }
.login-btn { width: 100%; padding: 11px 16px; margin-top: 4px; }
.login-btn:disabled { opacity: .6; cursor: not-allowed; }
.error { color: var(--red); font-size: 13px; margin: 2px 0 0; }

.switch { margin-top: 20px; font-size: 13px; color: var(--sub); }
.switch a { color: var(--red); font-weight: 600; }


@media (max-width: 640px) {
  .login-wrap { padding: 40px 16px 80px; }
  .login-panel { padding: 24px 18px 22px; }
}
</style>
