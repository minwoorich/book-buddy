<script setup lang="ts">
const { user } = useCurrentUser()
const { open, messages, sending, send } = useChat()

const draft = ref('')
const bodyRef = ref<HTMLElement | null>(null)

function close() {
  open.value = false
}

async function submit() {
  const text = draft.value
  if (!text.trim() || sending.value) return
  draft.value = ''
  await send(text)
}

watch([() => messages.value.length, sending], async () => {
  await nextTick()
  if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
})
</script>

<template>
  <template v-if="user">
    <button v-if="!open" type="button" class="fab" title="책벗" @click="open = true">
      <span class="fab-glyph">友</span>
    </button>

    <div v-else class="chat">
      <div class="chat-head">
        <div class="logo-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
        </div>
        <div><b>책벗</b><span>● 대출·예약·신청까지 대신해드려요</span></div>
        <button type="button" class="x" title="닫기" @click="close">×</button>
      </div>

      <div ref="bodyRef" class="chat-body">
        <p v-if="messages.length === 0" class="welcome">무엇이든 물어보세요. 책 추천부터 대출·예약, 리뷰까지 도와드려요.</p>

        <AiChatMessage v-for="(msg, i) in messages" :key="i" :msg="msg" />

        <div v-if="sending" class="thinking">
          <span class="tag">책벗</span>
          생각 중...
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
.fab-glyph { font-family: "Noto Serif KR", serif; font-size: 26px; font-weight: 600; color: #fff; line-height: 1; }
.chat { position: fixed; right: 30px; bottom: 30px; width: 400px; height: 620px; background: var(--card); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: 0 24px 60px rgba(60,48,28,.35); display: flex; flex-direction: column; overflow: hidden; z-index: 100; }
.chat-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--bg); }
.chat-head .logo-mark { width: 30px; height: 30px; }
.chat-head b { font-family: "Noto Serif KR", serif; font-size: 15.5px; display: block; }
.chat-head span { font-size: 11.5px; color: var(--ok); }
.chat-head .x { margin-left: auto; font-size: 20px; color: var(--sub); cursor: pointer; background: none; border: 0; padding: 4px; }
.chat-body { flex: 1; overflow-y: auto; padding: 18px 16px; display: flex; flex-direction: column; gap: 14px; }
.welcome { margin: 0; font-size: 13.5px; color: var(--sub); line-height: 1.6; }
.thinking { align-self: stretch; background: var(--card-2); border: 1px solid var(--line); border-radius: 14px 14px 14px 3px; padding: 12px 14px; font-size: 14px; color: var(--sub); font-style: italic; }
.thinking .tag { font-size: 10.5px; letter-spacing: 2px; color: var(--red); font-weight: 700; display: block; margin-bottom: 6px; font-style: normal; }
.chat-foot { border-top: 1px solid var(--line); padding: 12px 14px; display: flex; align-items: center; gap: 10px; background: var(--bg); }
.chat-foot input { flex: 1; border: 0; outline: 0; font: inherit; font-size: 14px; background: transparent; color: var(--ink); }
.chat-foot .send { width: 36px; height: 36px; border-radius: 50%; background: var(--red); border: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.chat-foot .send:hover { background: var(--red-dark); }
.chat-foot .send:disabled { opacity: .6; cursor: not-allowed; }
</style>
