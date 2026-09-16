<script setup lang="ts">
const { user } = useCurrentUser()
const { open, messages, sending, send, streamText, activity } = useChat()
const route = useRoute()

// /login·/signup 화면에서는 굳이 책벗 FAB로 로그인을 또 유도할 필요가 없다.
const hideWidget = computed(() => route.path === '/login' || route.path === '/signup')

const draft = ref('')
const bodyRef = ref<HTMLElement | null>(null)

// 스트리밍 중 도착한 본문은 완성된 답변과 같은 마크다운 렌더를 거친다 — done으로 바뀌는
// 순간 글자가 다시 그려지지 않고 아래에 책·버튼만 붙는 것처럼 보이게.
const renderedStream = computed(() => renderMarkdown(streamText.value))
/** 아직 첫 글자가 오기 전에는 로더가 "무엇을 하는 중"인지 알려준다. */
const loaderLabel = computed(() => (activity.value ? `책벗이 ${activity.value}...` : '책벗이 서가를 걷는 중...'))

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

watch([() => messages.value.length, sending, streamText], scrollToBottom)
// 열 때는 복원된 대화(sessionStorage)가 렌더된 뒤 한 번 더 — 처음 열면 항상 최신 메시지가 보이게.
watch(open, (isOpen) => {
  if (isOpen) void scrollToBottom()
})

// ── 크기 조절(QA #78 → #86): 버튼 대신 패널 왼쪽 위 모서리의 손잡이를 끌어 자유롭게 늘리고 줄인다.
// 패널은 오른쪽 아래에 고정돼 있으므로 손잡이(왼쪽 위)를 끌면 폭 = 오른쪽 끝 − 포인터 x,
// 높이 = 아래 끝 − 포인터 y. 크기는 브라우저에 기억. 모바일은 전체 화면이라 손잡이를 쓰지 않는다.
const SIZE_KEY = 'bb:chat:size'
const DEFAULT_SIZE = { w: 400, h: 620 }
const MIN_W = 320
const MIN_H = 420
const MARGIN = 30 // .chat의 right/bottom
const isMobile = useIsMobile()
const panelW = ref(DEFAULT_SIZE.w)
const panelH = ref(DEFAULT_SIZE.h)
const resizing = ref(false)

function clampSize(w: number, h: number): { w: number; h: number } {
  const maxW = Math.max(MIN_W, window.innerWidth - MARGIN * 2)
  const maxH = Math.max(MIN_H, window.innerHeight - MARGIN * 2)
  return { w: Math.round(Math.min(maxW, Math.max(MIN_W, w))), h: Math.round(Math.min(maxH, Math.max(MIN_H, h))) }
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null') as { w?: number; h?: number } | null
    if (saved && typeof saved.w === 'number' && typeof saved.h === 'number') {
      const c = clampSize(saved.w, saved.h)
      panelW.value = c.w
      panelH.value = c.h
    }
  } catch {
    // 저장소 접근 실패는 무시
  }
  if (open.value) void scrollToBottom()
})

const panelStyle = computed(() => (isMobile.value ? undefined : { width: `${panelW.value}px`, height: `${panelH.value}px` }))

function startResize(e: PointerEvent) {
  if (isMobile.value) return
  e.preventDefault()
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  resizing.value = true
  const rightEdge = window.innerWidth - MARGIN
  const bottomEdge = window.innerHeight - MARGIN

  const onMove = (ev: PointerEvent) => {
    const c = clampSize(rightEdge - ev.clientX, bottomEdge - ev.clientY)
    panelW.value = c.w
    panelH.value = c.h
  }
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
    resizing.value = false
    try {
      localStorage.setItem(SIZE_KEY, JSON.stringify({ w: panelW.value, h: panelH.value }))
    } catch {
      // 무시
    }
    void scrollToBottom()
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}

/** 더블클릭하면 기본 크기로 되돌린다. */
function resetSize() {
  panelW.value = DEFAULT_SIZE.w
  panelH.value = DEFAULT_SIZE.h
  try {
    localStorage.removeItem(SIZE_KEY)
  } catch {
    // 무시
  }
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

    <div v-else class="chat" :class="{ resizing }" :style="panelStyle">
      <div
        v-if="!isMobile"
        class="resize-handle"
        title="끌어서 크기 조절 · 더블클릭하면 기본 크기"
        aria-label="책벗 창 크기 조절"
        role="separator"
        @pointerdown="startResize"
        @dblclick="resetSize"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 13L13 1M1 8l7-7M6 13l7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" /></svg>
      </div>
      <div class="chat-head">
        <div class="logo-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
        </div>
        <div><b>책벗</b><span>● 대출·예약·신청까지 대신해드려요</span></div>
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

        <!-- 답변이 도착하는 동안: 첫 글자 전에는 로더, 델타가 오기 시작하면 타자기 말풍선.
             done이 오면 useChat이 이 자리를 완성된 메시지(책·버튼·근거 포함)로 바꾼다. -->
        <div v-if="sending" class="thinking" :class="{ typing: streamText }">
          <span class="tag">책벗</span>
          <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown이 이스케이프 후 만든 HTML만 들어온다 -->
          <div v-if="streamText" class="stream-text md-body" v-html="renderedStream" />
          <AiLibrarySearchLoader v-else compact :label="loaderLabel" />
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
.chat { position: fixed; right: 30px; bottom: 30px; width: 400px; height: 620px; max-width: calc(100vw - 60px); max-height: calc(100vh - 60px); background: var(--card); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: 0 24px 60px var(--shadow-strong); display: flex; flex-direction: column; overflow: hidden; z-index: 100; }
/* 끄는 동안 본문 텍스트 선택·전환 애니메이션이 끼어들지 않게 */
.chat.resizing { user-select: none; }
/* 왼쪽 위 모서리 손잡이(QA #86): 대각선 그립, 커서는 ↖↘ */
.resize-handle { position: absolute; top: 0; left: 0; width: 22px; height: 22px; z-index: 3; cursor: nwse-resize; color: var(--sub); display: flex; align-items: center; justify-content: center; border-radius: 10px 0 8px 0; background: var(--bg); touch-action: none; }
.resize-handle:hover, .chat.resizing .resize-handle { color: var(--red); background: var(--red-tint); }
.chat-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 14px 22px; border-bottom: 1px solid var(--line); background: var(--bg); }
.chat-head .logo-mark { width: 30px; height: 30px; }
.chat-head b { font-family: var(--font-display); font-size: 15.5px; display: block; }
.chat-head span { font-size: 12px; font-weight: 600; color: var(--ok); }
.chat-head .x { margin-left: auto; font-size: 20px; color: var(--sub); cursor: pointer; background: none; border: 0; padding: 4px; }
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
/* 타자기 말풍선: 완성된 답변(.msg-ai)과 같은 글꼴·여백이라 done 순간 글자가 튀지 않는다. */
.thinking.typing { padding: 12px 14px; font-size: 14px; line-height: 1.65; color: var(--text-2); }
.stream-text::after { content: '▍'; color: var(--red); margin-left: 1px; animation: caret 1s steps(2) infinite; }
@keyframes caret { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .stream-text::after { animation: none; } }
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
  .chat { inset: 0; width: auto; height: auto; max-width: none; max-height: none; border-radius: 0; border: 0; }
  .chat.guest-teaser { top: auto; }
  .chat-head { padding: 12px 14px; }
  .chat-foot { padding: 10px 12px; padding-bottom: max(10px, env(safe-area-inset-bottom)); }
}
</style>
