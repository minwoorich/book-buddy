<script setup lang="ts">
import type { User } from '#shared/types'

const api = useApi()
const { login } = useCurrentUser()

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
    <div class="logo-big">
      <div class="logo-mark">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M3 5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0V5z"></path><line x1="12" y1="5" x2="12" y2="19"></line></svg>
      </div>
      <div><b>Book Buddy</b><span>VATECH LIBRARY</span></div>
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
    </div>

    <div class="hint card-2">
      시연 계정 — 일반: 김민우 / 1234 · 관리자: 도서관리자 / admin1234
    </div>
  </div>
</template>

<style scoped>
.login-wrap { max-width: 420px; margin: 0 auto; padding: 70px 24px 90px; text-align: center; }
.logo-big { display: inline-flex; align-items: center; gap: 12px; margin-bottom: 26px; }
.logo-big .logo-mark { width: 44px; height: 44px; border-radius: 10px; }
.logo-big b { font-family: "Noto Serif KR", serif; font-size: 26px; display: block; text-align: left; }
.logo-big span { font-size: 11px; color: var(--sub); letter-spacing: 2.6px; display: block; text-align: left; margin-top: 2px; }

.login-panel { text-align: center; padding: 32px 28px 30px; }
h1 { font-family: "Noto Serif KR", serif; font-size: 24px; font-weight: 600; margin: 0 0 8px; }
.sub { color: var(--sub); font-size: 14.5px; margin-bottom: 28px; }

.login-form { display: flex; flex-direction: column; gap: 12px; text-align: left; }
.login-btn { width: 100%; padding: 11px 16px; margin-top: 4px; }
.login-btn:disabled { opacity: .6; cursor: not-allowed; }
.error { color: var(--red); font-size: 13px; margin: 2px 0 0; }

.hint { margin-top: 22px; padding: 12px 16px; border-radius: 4px; font-size: 12.5px; color: var(--sub); background: var(--card-2); border: 1px solid var(--line); }
</style>
