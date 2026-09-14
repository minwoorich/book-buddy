<script setup lang="ts">
// 팀 QA용 인앱 피드백 버튼. 로그인 상태에서만 렌더링되며,
// 현재 경로·화면 크기를 자동 수집해 한 줄 신고를 접수한다.
const { user } = useCurrentUser()
const api = useApi()
const route = useRoute()

const open = ref(false)
const content = ref('')
const sending = ref(false)
const done = ref(false)

async function submit() {
  const text = content.value.trim()
  if (!text || sending.value) return
  sending.value = true
  try {
    await api('/api/qa-feedback', {
      method: 'POST',
      body: {
        content: text,
        path: route.fullPath,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    })
    content.value = ''
    done.value = true
    setTimeout(() => {
      done.value = false
      open.value = false
    }, 1200)
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <template v-if="user">
    <button v-if="!open" class="qa-fab" title="QA 피드백 보내기" @click="open = true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="6"></circle><path d="M9 8l-2-3M15 8l2-3M4 13H1M23 13h-3M5 18l-2 2M19 18l2 2"></path></svg>
      QA
    </button>
    <div v-else class="qa-panel">
      <div class="qa-head">
        <b>QA 피드백</b>
        <span class="qa-path">{{ route.fullPath }}</span>
        <button class="qa-x" @click="open = false">×</button>
      </div>
      <template v-if="!done">
        <textarea
          v-model="content"
          rows="3"
          placeholder="이상한 점을 한 줄로 적어주세요 — 페이지·화면크기는 자동으로 담겨요"
          @keydown.ctrl.enter="submit"
        ></textarea>
        <div class="qa-actions">
          <button class="btn sm" :disabled="sending" @click="open = false">취소</button>
          <button class="btn primary sm" :disabled="sending || !content.trim()" @click="submit">
            {{ sending ? '보내는 중...' : '보내기' }}
          </button>
        </div>
      </template>
      <div v-else class="qa-done">접수됐어요, 고마워요! 🐛</div>
    </div>
  </template>
</template>

<style scoped>
.qa-fab {
  position: fixed; left: 24px; bottom: 24px; z-index: 49;
  display: flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12.5px; font-weight: 700;
  color: var(--sub); background: var(--card);
  border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 8px 14px; cursor: pointer;
  box-shadow: 0 4px 12px rgba(84, 70, 45, 0.15);
}
.qa-fab:hover { color: var(--red); border-color: var(--red); }
.qa-panel {
  position: fixed; left: 24px; bottom: 24px; z-index: 49;
  width: 320px; background: var(--card);
  border: 1px solid var(--line-strong); border-radius: 10px;
  padding: 14px; box-shadow: 0 12px 32px rgba(60, 48, 28, 0.25);
  display: flex; flex-direction: column; gap: 10px;
}
.qa-head { display: flex; align-items: baseline; gap: 8px; }
.qa-head b { font-size: 14px; color: var(--red); }
.qa-path {
  flex: 1; font-size: 11.5px; color: var(--sub);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.qa-x { border: 0; background: none; font-size: 18px; color: var(--sub); cursor: pointer; padding: 0 2px; }
textarea {
  font: inherit; font-size: 13.5px; color: var(--ink);
  background: var(--bg); border: 1px solid var(--line-strong); border-radius: 6px;
  padding: 9px 11px; resize: none; outline: 0;
}
textarea:focus { border-color: var(--red); }
.qa-actions { display: flex; justify-content: flex-end; gap: 8px; }
.qa-done { font-size: 14px; color: var(--ok); padding: 8px 0; text-align: center; }
</style>
