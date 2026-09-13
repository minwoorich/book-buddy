<script setup lang="ts">
import type { User } from '#shared/types'

const { data: users } = await useFetch<User[]>('/api/users')
const { login } = useCurrentUser()

async function selectUser(u: User) {
  login(u)
  await navigateTo(u.role === 'admin' ? '/admin' : '/')
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
    <h1>어서 오세요</h1>
    <div class="sub">이름을 선택하면 바로 시작합니다</div>

    <div class="people">
      <button
        v-for="u in users"
        :key="u.id"
        type="button"
        class="person"
        @click="selectUser(u)"
      >
        <span class="avatar">{{ u.name.charAt(0) }}</span>
        <span class="nm">{{ u.name }}</span>
        <span class="org">
          {{ u.company }} · {{ u.department }}<br>
          <template v-if="u.role === 'admin'"><span class="badge red">관리자</span></template>
          <template v-else>{{ u.team }} · {{ u.position }}</template>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-wrap { max-width: 860px; margin: 0 auto; padding: 70px 24px 90px; text-align: center; }
.logo-big { display: inline-flex; align-items: center; gap: 12px; margin-bottom: 26px; }
.logo-big .logo-mark { width: 44px; height: 44px; border-radius: 10px; }
.logo-big b { font-family: "Noto Serif KR", serif; font-size: 26px; display: block; text-align: left; }
.logo-big span { font-size: 11px; color: var(--sub); letter-spacing: 2.6px; display: block; text-align: left; margin-top: 2px; }
h1 { font-family: "Noto Serif KR", serif; font-size: 24px; font-weight: 600; margin: 0 0 8px; }
.sub { color: var(--sub); font-size: 14.5px; margin-bottom: 40px; }
.people { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.person { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 18px 12px 16px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: border-color .12s, transform .12s; font: inherit; }
.person:hover { border-color: var(--red); transform: translateY(-3px); }
.person .avatar { width: 44px; height: 44px; font-size: 17px; }
.person .nm { font-weight: 700; font-size: 15px; color: var(--ink); }
.person .org { font-size: 12px; color: var(--sub); line-height: 1.5; }
</style>
