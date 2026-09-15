<script setup lang="ts">
import type { QaCategory, QaSeverity } from '#shared/types'

// 팀 QA용 인앱 피드백 버튼. 로그인 상태에서만 렌더링되며,
// 현재 경로·화면 크기를 자동 수집해 구조화된 신고(유형/심각도/요약/상세/스크린샷)를 접수한다.
const { user } = useCurrentUser()
const api = useApi()
const route = useRoute()

const MAX_IMAGES = 3

const open = ref(false)
const sending = ref(false)
const done = ref(false)

const category = ref<QaCategory>('bug')
const severity = ref<QaSeverity>('inconvenient')
const content = ref('')
const detail = ref('')
const files = ref<File[]>([])
const previews = ref<string[]>([])

const CATEGORIES: { key: QaCategory; label: string }[] = [
  { key: 'bug', label: '🐛 버그' },
  { key: 'ui', label: '🎨 디자인·UI' },
  { key: 'idea', label: '💡 개선 아이디어' },
  { key: 'question', label: '❓ 질문' },
]

const SEVERITIES: { key: QaSeverity; label: string }[] = [
  { key: 'blocker', label: '진행 불가' },
  { key: 'inconvenient', label: '불편함' },
  { key: 'minor', label: '사소함' },
]

function revokePreviews() {
  previews.value.forEach((url) => URL.revokeObjectURL(url))
  previews.value = []
}

function addFiles(picked: File[]) {
  for (const f of picked) {
    if (files.value.length >= MAX_IMAGES) {
      alert(`스크린샷은 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`)
      break
    }
    files.value.push(f)
    previews.value.push(URL.createObjectURL(f))
  }
}

function onPickFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = [...(input.files ?? [])].filter((f) => f.type.startsWith('image/'))
  input.value = '' // 같은 파일을 다시 골라도 change가 뜨도록 리셋
  addFiles(picked)
}

/** 캡처 후 Ctrl+V로 바로 붙여넣을 수 있게(QA #36) 패널 어디서든 클립보드 이미지를 받는다. */
function onPaste(e: ClipboardEvent) {
  const pasted = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (pasted.length === 0) return
  e.preventDefault()
  addFiles(pasted)
}

function removeFile(i: number) {
  const [url] = previews.value.splice(i, 1)
  if (url) URL.revokeObjectURL(url)
  files.value.splice(i, 1)
}

function resetForm() {
  category.value = 'bug'
  severity.value = 'inconvenient'
  content.value = ''
  detail.value = ''
  files.value = []
  revokePreviews()
}

async function submit() {
  const summary = content.value.trim()
  if (!summary || sending.value) return
  sending.value = true
  try {
    const form = new FormData()
    form.set('content', summary)
    form.set('category', category.value)
    form.set('severity', severity.value)
    form.set('detail', detail.value.trim())
    form.set('path', route.fullPath)
    form.set('viewport', `${window.innerWidth}x${window.innerHeight}`)
    files.value.forEach((f) => form.append('image', f))

    await api('/api/qa-feedback', { method: 'POST', body: form })
    resetForm()
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

onBeforeUnmount(revokePreviews)
</script>

<template>
  <template v-if="user">
    <button v-if="!open" class="qa-fab" title="QA 피드백 보내기" @click="open = true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="6"></circle><path d="M9 8l-2-3M15 8l2-3M4 13H1M23 13h-3M5 18l-2 2M19 18l2 2"></path></svg>
      QA
    </button>
    <div v-else class="qa-panel" @paste="onPaste">
      <div class="qa-head">
        <b>QA 피드백</b>
        <span class="qa-path">{{ route.fullPath }}</span>
        <button class="qa-x" @click="open = false">×</button>
      </div>
      <template v-if="!done">
        <div class="field">
          <label>유형</label>
          <div class="chips">
            <button
              v-for="c in CATEGORIES"
              :key="c.key"
              type="button"
              class="chip"
              :class="{ on: category === c.key }"
              @click="category = c.key"
            >{{ c.label }}</button>
          </div>
        </div>

        <div class="field">
          <label>심각도</label>
          <div class="chips">
            <button
              v-for="s in SEVERITIES"
              :key="s.key"
              type="button"
              class="chip"
              :class="{ on: severity === s.key, danger: s.key === 'blocker' && severity === 'blocker' }"
              @click="severity = s.key"
            >{{ s.label }}</button>
          </div>
        </div>

        <div class="field">
          <label>한 줄 요약 <em>*</em></label>
          <input
            v-model="content"
            type="text"
            maxlength="100"
            placeholder="예: 책 상세에서 예약 버튼이 눌리지 않아요"
            @keydown.enter="submit"
          />
        </div>

        <div class="field">
          <label>상세 설명 <span class="opt">선택</span></label>
          <textarea
            v-model="detail"
            rows="4"
            placeholder="어떻게 하면 재현되나요?&#10;· 순서: 어떤 화면에서 무엇을 눌렀는지&#10;· 기대: 어떻게 되길 바랐는지&#10;· 실제: 실제로는 어떻게 됐는지"
            @keydown.ctrl.enter="submit"
          ></textarea>
        </div>

        <div class="field">
          <label>스크린샷 <span class="opt">최대 {{ MAX_IMAGES }}장 · Ctrl+V 붙여넣기 가능 · 해결되면 자동 삭제</span></label>
          <div class="shots">
            <div v-for="(src, i) in previews" :key="src" class="shot">
              <img :src="src" alt="첨부 스크린샷 미리보기" />
              <button type="button" class="shot-x" title="첨부 제거" @click="removeFile(i)">×</button>
            </div>
            <label v-if="files.length < MAX_IMAGES" class="shot add" title="스크린샷 첨부">
              +
              <input type="file" accept="image/*" multiple hidden @change="onPickFiles" />
            </label>
          </div>
        </div>

        <div class="qa-actions">
          <span class="auto-note">페이지·화면크기 자동 수집</span>
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
  box-shadow: 0 4px 12px var(--shadow);
}
.qa-fab:hover { color: var(--red); border-color: var(--red); }
.qa-panel {
  position: fixed; left: 24px; bottom: 24px; z-index: 49;
  width: 372px; max-height: calc(100vh - 48px); overflow-y: auto;
  background: var(--card);
  border: 1px solid var(--line-strong); border-radius: 10px;
  padding: 14px; box-shadow: 0 12px 32px var(--shadow-strong);
  display: flex; flex-direction: column; gap: 12px;
}
.qa-head { display: flex; align-items: baseline; gap: 8px; }
.qa-head b { font-size: 14px; color: var(--red); }
.qa-path {
  flex: 1; font-size: 11.5px; color: var(--sub);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.qa-x { border: 0; background: none; font-size: 18px; color: var(--sub); cursor: pointer; padding: 0 2px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 11.5px; font-weight: 700; color: var(--sub); letter-spacing: 0.02em; }
.field label em { color: var(--red); font-style: normal; }
.field .opt { font-weight: 400; color: var(--sub); opacity: 0.8; }

.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  font: inherit; font-size: 12px; font-weight: 600; color: var(--sub);
  background: var(--bg); border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 5px 11px; cursor: pointer;
}
.chip.on { color: var(--red); border-color: var(--red); background: var(--red-tint); }
.chip.danger { color: #fff; background: var(--red); }

input[type='text'], textarea {
  font: inherit; font-size: 13.5px; color: var(--ink);
  background: var(--bg); border: 1px solid var(--line-strong); border-radius: 6px;
  padding: 9px 11px; resize: none; outline: 0; width: 100%;
}
input[type='text']:focus, textarea:focus { border-color: var(--red); }
textarea { line-height: 1.55; }
textarea::placeholder { font-size: 12.5px; }

.shots { display: flex; gap: 8px; }
.shot {
  position: relative; width: 62px; height: 62px; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--line-strong); background: var(--bg);
}
.shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.shot-x {
  position: absolute; top: 2px; right: 2px; width: 18px; height: 18px;
  border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.6); color: #fff;
  font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.shot.add {
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: var(--sub); cursor: pointer; border-style: dashed;
}
.shot.add:hover { color: var(--red); border-color: var(--red); }

.qa-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.auto-note { margin-right: auto; font-size: 11px; color: var(--sub); opacity: 0.85; }
.qa-done { font-size: 14px; color: var(--ok); padding: 8px 0; text-align: center; }

@media (max-width: 640px) {
  .qa-fab { left: 16px; bottom: 16px; padding: 7px 12px; }
  /* 열린 패널이 챗봇 FAB(z-index 50) 아래 깔려 보내기 버튼이 가려지지 않게 */
  .qa-panel { left: 12px; right: 12px; bottom: 12px; width: auto; max-height: calc(100vh - 24px); z-index: 51; }
}
</style>
