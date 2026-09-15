<script setup lang="ts">
const { user } = useCurrentUser()
const { open, messages, sending, send } = useChat()
const route = useRoute()

// /login·/signup 화면에서는 굳이 책벗 FAB로 로그인을 또 유도할 필요가 없다.
const hideWidget = computed(() => route.path === '/login' || route.path === '/signup')

const draft = ref('')
const bodyRef = ref<HTMLElement | null>(null)

function close() {
  open.value = false
}

function goLogin() {
  void navigateTo('/login')
}

function goSignup() {
  void navigateTo('/signup')
}

async function submit() {
  const text = draft.value
  if (!text.trim() || sending.value) return
  draft.value = ''
  await send(text)
}

// 처음 여는 사람을 위한 예시 질문(QA #31) — 클릭하면 그대로 전송된다.
const EXAMPLE_QUESTIONS = [
  '요즘 인기 있는 책 추천해줘',
  '퇴근길에 가볍게 읽을 에세이 있어?',
  '내가 빌린 책 반납일 알려줘',
  '개발 입문자한테 좋은 책 찾아서 대출까지 해줘',
]

async function sendExample(question: string) {
  if (sending.value) return
  await send(question)
}

/** 대화 영역을 맨 아래로 — 새 메시지, 전송 상태 변화, 패널 열림/크기 변경 때마다(QA #78). */
async function scrollToBottom() {
  await nextTick()
  if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
}

watch([() => messages.value.length, sending], scrollToBottom)
// 열 때는 복원된 대화(sessionStorage)가 렌더된 뒤 한 번 더 — 처음 열면 항상 최신 메시지가 보이게.
watch(open, (isOpen) => {
  if (isOpen) void scrollToBottom()
})

// 크기 늘리기/줄이기(QA #78): 기본 400×620 ↔ 확장 640×(화면 높이 - 60). 선택은 브라우저에 기억.
const EXPANDED_KEY = 'bb:chat:expanded'
const expanded = ref(false)
onMounted(() => {
  try {
    expanded.value = localStorage.getItem(EXPANDED_KEY) === '1'
  } catch {
    // 저장소 접근 실패는 무시
  }
  if (open.value) void scrollToBottom()
})
function toggleExpanded() {
  expanded.value = !expanded.value
  try {
    localStorage.setItem(EXPANDED_KEY, expanded.value ? '1' : '0')
  } catch {
    // 무시
  }
  void scrollToBottom()
}
</script>

<template>
  <template v-if="!hideWidget">
    <button v-if="!open" type="button" class="fab" title="책벗" @click="open = true">
      <span class="fab-glyph">友</span>
    </button>

    <div v-else-if="!user" class="chat guest-teaser">
      <div class="chat-head">
        <div class="logo-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
        </div>
        <div><b>책벗</b></div>
        <button type="button" class="x" title="닫기" @click="close">×</button>
      </div>
      <div class="guest-body">
        <span class="guest-glyph">友</span>
        <p>책벗은 로그인 후 이용할 수 있는 서비스예요</p>
        <div class="guest-actions">
          <button type="button" class="btn primary" @click="goLogin">로그인</button>
          <button type="button" class="btn" @click="goSignup">회원가입</button>
        </div>
      </div>
    </div>

    <div v-else class="chat" :class="{ expanded }">
      <div class="chat-head">
        <div class="logo-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
        </div>
        <div><b>책벗</b><span>● 대출·예약·신청까지 대신해드려요</span></div>
        <button type="button" class="resize" :title="expanded ? '작게 보기' : '크게 보기'" :aria-label="expanded ? '작게 보기' : '크게 보기'" @click="toggleExpanded">
          <svg v-if="!expanded" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>
        </button>
        <button type="button" class="x" title="닫기" @click="close">×</button>
      </div>

      <div ref="bodyRef" class="chat-body">
        <div v-if="messages.length === 0" class="onboarding">
          <p class="welcome">
            안녕하세요, 책벗이에요 🙌<br />
            이런 걸 대신해드릴 수 있어요:
          </p>
          <ul class="can-do">
            <li>📖 취향·상황에 맞는 책 추천</li>
            <li>📚 대출 · 반납 · 예약 실행 (실행 전에 꼭 여쭤봐요)</li>
            <li>🙏 사내에 없는 책은 희망도서 신청</li>
            <li>⏰ 내 대출 현황·반납일 확인</li>
          </ul>
          <p class="try-label">이렇게 물어보세요</p>
          <div class="examples">
            <button
              v-for="q in EXAMPLE_QUESTIONS"
              :key="q"
              type="button"
              class="example-chip"
              :disabled="sending"
              @click="sendExample(q)"
            >{{ q }}</button>
          </div>
        </div>

        <AiChatMessage v-for="(msg, i) in messages" :key="i" :msg="msg" />

        <div v-if="sending" class="thinking">
          <span class="tag">책벗</span>
          <AiLibrarySearchLoader compact label="책벗이 서가를 걷는 중..." />
        </div>
      </div>

      <form class="chat-foot" @submit.prevent="submit">
        <input v-model="draft" :disabled="sending" placeholder="책벗에게 무엇이든 물어보세요">
        <button type="submit" class="send" :disabled="sending" aria-label="전송">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M3 11l18-7-7 18-2.5-7L3 11z"></path></svg>
        </button>
      </form>
    </div>
  </template>
</template>

<style scoped>
.fab-glyph { font-family: var(--font-serif); font-size: 32px; font-weight: 600; color: #fff; line-height: 1; }
.chat { position: fixed; right: 30px; bottom: 30px; width: 400px; height: 620px; max-height: calc(100vh - 60px); background: var(--card); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: 0 24px 60px rgba(60,48,28,.35); display: flex; flex-direction: column; overflow: hidden; z-index: 100; transition: width .2s ease, height .2s ease; }
/* 크게 보기(QA #78): 폭 640, 높이는 화면에 맞춰 */
.chat.expanded { width: 640px; height: calc(100vh - 60px); }
.chat.expanded .chat-body { padding: 22px 24px; }
.chat-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--bg); }
.chat-head .logo-mark { width: 30px; height: 30px; }
.chat-head b { font-family: var(--font-display); font-size: 15.5px; display: block; }
.chat-head span { font-size: 12px; font-weight: 600; color: var(--ok); }
.chat-head .resize { margin-left: auto; display: flex; color: var(--sub); cursor: pointer; background: none; border: 0; padding: 6px; border-radius: 4px; }
.chat-head .resize:hover { color: var(--ink); background: var(--card-2); }
.chat-head .x { font-size: 20px; color: var(--sub); cursor: pointer; background: none; border: 0; padding: 4px; }
.chat-body { flex: 1; overflow-y: auto; padding: 18px 16px; display: flex; flex-direction: column; gap: 14px; }
.welcome { margin: 0; font-size: 13.5px; color: var(--sub); line-height: 1.6; }
.onboarding { display: flex; flex-direction: column; gap: 10px; }
.onboarding .welcome { color: var(--ink); font-size: 14px; }
.can-do { margin: 0; padding: 0 0 0 2px; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--sub); line-height: 1.5; }
.try-label { margin: 8px 0 0; font-size: 11.5px; font-weight: 700; letter-spacing: 1px; color: var(--red); }
.examples { display: flex; flex-wrap: wrap; gap: 7px; }
.example-chip {
  font: inherit; font-size: 12.5px; color: var(--ink); text-align: left;
  background: var(--bg); border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 7px 13px; cursor: pointer;
}
.example-chip:hover { border-color: var(--red); color: var(--red); background: var(--red-tint); }
.example-chip:disabled { opacity: .5; cursor: not-allowed; }
.thinking { align-self: stretch; background: var(--card-2); border: 1px solid var(--line); border-radius: 14px 14px 14px 3px; padding: 12px 14px 8px; }
.thinking .tag { font-size: 10.5px; letter-spacing: 2px; color: var(--red); font-weight: 700; display: block; margin-bottom: 4px; }
.chat-foot { border-top: 1px solid var(--line); padding: 12px 14px; display: flex; align-items: center; gap: 10px; background: var(--bg); }
.chat-foot input { flex: 1; border: 0; outline: 0; font: inherit; font-size: 14px; background: transparent; color: var(--ink); }
.chat-foot .send { width: 36px; height: 36px; border-radius: 50%; background: var(--red); border: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.chat-foot .send:hover { background: var(--red-dark); }
.chat-foot .send:disabled { opacity: .6; cursor: not-allowed; }

.guest-teaser { height: auto; }
.guest-body { padding: 34px 24px 30px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; }
.guest-glyph { font-family: var(--font-serif); font-size: 34px; font-weight: 600; color: var(--red); line-height: 1; }
.guest-body p { margin: 0; font-size: 14px; color: var(--sub); line-height: 1.6; }
.guest-actions { display: flex; gap: 10px; }

/* 모바일: 챗 패널을 화면 전체로 — 좁은 화면에서 400px 고정폭 카드가 넘치던 문제 */
@media (max-width: 640px) {
  .chat, .chat.expanded { inset: 0; width: auto; height: auto; max-height: none; border-radius: 0; border: 0; }
  .chat-head .resize { display: none; }
  .chat.guest-teaser { top: auto; }
  .chat-head { padding: 12px 14px; }
  .chat-foot { padding: 10px 12px; padding-bottom: max(10px, env(safe-area-inset-bottom)); }
}
</style>
