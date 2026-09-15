<script setup lang="ts">
import type { User } from '#shared/types'

const api = useApi()
const { login } = useCurrentUser()

const name = ref('')
const password = ref('')
const company = ref('바텍')
const department = ref('')
const team = ref('')
const position = ref('')
const gender = ref<'M' | 'F'>('M')
const birthYear = ref<number | null>(null)
const loading = ref(false)
const error = ref('')

// 계열사 확대 + 부서/팀/직급 추천 목록(QA #12). 부서·팀·직급은 자유 입력에
// datalist 제안만 얹는다 — 조직도를 강제할 데이터가 없으니 제안이 최선이다.
const COMPANIES = ['바텍', '레이언스', '바텍네트웍스', '바텍이우홀딩스', '바텍엠시스']
const DEPARTMENT_SUGGESTIONS = [
  '개발본부', '연구소', '마케팅본부', '영업본부', '경영지원본부', '품질본부', '기획본부', '정보전략실', '인사실', '생산본부',
]
const TEAM_SUGGESTIONS = [
  'SW개발팀', 'HW개발팀', '기구개발팀', '연구1팀', '연구2팀', '마케팅팀', '영업팀', 'CS팀', '인사팀', '재무팀', '총무팀', '품질팀', '기획팀', '구매팀', '생산팀',
]
const POSITION_SUGGESTIONS = ['사원', '주임', '대리', '과장', '차장', '부장', '책임', '수석', '팀장', '실장']

async function submit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    const user = await api<User>('/api/auth/signup', {
      method: 'POST',
      body: {
        name: name.value,
        password: password.value,
        company: company.value,
        department: department.value,
        team: team.value,
        position: position.value,
        gender: gender.value,
        birthYear: birthYear.value,
      },
    })
    login(user)
    await navigateTo('/')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="signup-wrap">
    <div class="logo-big">
      <div class="logo-mark">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M3 5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0V5z"></path><line x1="12" y1="5" x2="12" y2="19"></line></svg>
      </div>
      <div><b>道, 서관</b><span>VATECH LIBRARY</span></div>
    </div>

    <div class="panel signup-panel">
      <h1>처음 뵙겠습니다</h1>
      <div class="sub">몇 가지 정보만 입력하면 바로 이용할 수 있어요</div>

      <form class="signup-form" @submit.prevent="submit">
        <input v-model="name" type="text" class="input" placeholder="이름" autofocus autocomplete="username">
        <input v-model="password" type="password" class="input" placeholder="비밀번호 (4자 이상)" autocomplete="new-password">

        <div class="row">
          <select v-model="company" class="input">
            <option v-for="c in COMPANIES" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="gender" class="input">
            <option value="M">남</option>
            <option value="F">여</option>
          </select>
        </div>

        <div class="row">
          <input v-model="department" type="text" class="input" placeholder="부서 (선택)" list="department-options">
          <input v-model="team" type="text" class="input" placeholder="팀 (선택)" list="team-options">
        </div>
        <datalist id="department-options">
          <option v-for="d in DEPARTMENT_SUGGESTIONS" :key="d" :value="d" />
        </datalist>
        <datalist id="team-options">
          <option v-for="t in TEAM_SUGGESTIONS" :key="t" :value="t" />
        </datalist>

        <div class="row">
          <input v-model="position" type="text" class="input" placeholder="직급 (선택)" list="position-options">
          <input v-model.number="birthYear" type="number" class="input" placeholder="출생연도" min="1940" max="2010">
        </div>
        <datalist id="position-options">
          <option v-for="p in POSITION_SUGGESTIONS" :key="p" :value="p" />
        </datalist>

        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn primary signup-btn" :disabled="loading">
          {{ loading ? '가입 중...' : '가입하기' }}
        </button>
      </form>

      <div class="switch">
        이미 계정이 있나요? <NuxtLink to="/login">로그인</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.signup-wrap { max-width: 460px; margin: 0 auto; padding: 70px 24px 90px; text-align: center; }
.logo-big { display: inline-flex; align-items: center; gap: 12px; margin-bottom: 26px; }
.logo-big .logo-mark { width: 44px; height: 44px; border-radius: 10px; }
.logo-big b { font-family: "Noto Serif KR", serif; font-size: 26px; display: block; text-align: left; }
.logo-big span { font-size: 11px; color: var(--sub); letter-spacing: 2.6px; display: block; text-align: left; margin-top: 2px; }

.signup-panel { text-align: center; padding: 32px 28px 30px; }
h1 { font-family: "Noto Serif KR", serif; font-size: 24px; font-weight: 600; margin: 0 0 8px; }
.sub { color: var(--sub); font-size: 14.5px; margin-bottom: 28px; }

.signup-form { display: flex; flex-direction: column; gap: 12px; text-align: left; }
.row { display: flex; gap: 12px; }
.row .input { flex: 1; min-width: 0; }
.signup-btn { width: 100%; padding: 11px 16px; margin-top: 4px; }
.signup-btn:disabled { opacity: .6; cursor: not-allowed; }
.error { color: var(--red); font-size: 13px; margin: 2px 0 0; }

.switch { margin-top: 20px; font-size: 13px; color: var(--sub); }
.switch a { color: var(--red); font-weight: 600; }

@media (max-width: 640px) {
  .signup-wrap { padding: 40px 16px 80px; }
  .signup-panel { padding: 24px 18px 22px; }
}
</style>
