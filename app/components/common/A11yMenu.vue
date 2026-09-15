<script setup lang="ts">
import { TEXT_SIZES, THEMES, type TextSize, type ThemePref } from '../../utils/a11yPrefs'

/**
 * 접근성 설정 팝오버 — 글자 크기 / 단순 화면 / 색약 모드 / 테마.
 * 헤더(사용자·관리자)와 로그인·회원가입 페이지에 같은 컴포넌트를 둔다.
 */
const { prefs, set, reset, isDefault } = useA11y()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const uid = useId()

const TEXT_LABELS: Record<TextSize, string> = { normal: '보통', large: '크게', xlarge: '아주 크게' }
const THEME_LABELS: Record<ThemePref, string> = { system: '시스템', light: '라이트', dark: '다크' }

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
function unbind() {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
}
watch(open, (v) => {
  if (!import.meta.client) return
  if (v) {
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
  } else {
    unbind()
  }
})
onUnmounted(() => {
  if (import.meta.client) unbind()
})

function onToggle(key: 'simple' | 'cvd', e: Event) {
  set({ [key]: (e.target as HTMLInputElement).checked })
}
</script>

<template>
  <div ref="root" class="a11y">
    <button
      type="button"
      class="a11y-btn"
      :class="{ on: !isDefault }"
      title="접근성 설정"
      aria-label="접근성 설정"
      :aria-expanded="open"
      :aria-controls="`${uid}-panel`"
      @click="open = !open"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none" />
        <path d="M4 9h16" /><path d="M12 9v5" /><path d="M12 14l-3.5 6.5" /><path d="M12 14l3.5 6.5" />
      </svg>
      <span class="a11y-label">접근성</span>
    </button>

    <div v-if="open" :id="`${uid}-panel`" class="a11y-panel" role="dialog" aria-label="접근성 설정">
      <div class="a11y-head">
        <b>접근성 설정</b>
        <button type="button" class="a11y-reset" :disabled="isDefault" @click="reset()">기본값으로</button>
      </div>

      <div class="a11y-row">
        <span :id="`${uid}-text`" class="a11y-name">글자 크기</span>
        <div class="a11y-seg" role="radiogroup" :aria-labelledby="`${uid}-text`">
          <button
            v-for="t in TEXT_SIZES"
            :key="t"
            type="button"
            role="radio"
            :aria-checked="prefs.text === t"
            :class="{ on: prefs.text === t }"
            @click="set({ text: t })"
          >{{ TEXT_LABELS[t] }}</button>
        </div>
      </div>

      <label class="a11y-row">
        <span class="a11y-name">단순 화면<small>장식 없이 크고 또렷하게</small></span>
        <input type="checkbox" class="a11y-switch" :checked="prefs.simple" @change="onToggle('simple', $event)">
      </label>

      <label class="a11y-row">
        <span class="a11y-name">색약 모드<small>초록 대신 파랑, 기호로 구분</small></span>
        <input type="checkbox" class="a11y-switch" :checked="prefs.cvd" @change="onToggle('cvd', $event)">
      </label>

      <div class="a11y-row">
        <span :id="`${uid}-theme`" class="a11y-name">화면 테마</span>
        <div class="a11y-seg" role="radiogroup" :aria-labelledby="`${uid}-theme`">
          <button
            v-for="t in THEMES"
            :key="t"
            type="button"
            role="radio"
            :aria-checked="prefs.theme === t"
            :class="{ on: prefs.theme === t }"
            @click="set({ theme: t })"
          >{{ THEME_LABELS[t] }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.a11y { position: relative; }
.a11y-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-size: 13px; color: var(--sub);
  background: none; border: 1px solid transparent; border-radius: 999px; padding: 5px 9px; cursor: pointer;
}
.a11y-btn:hover { color: var(--ink); border-color: var(--line-strong); }
.a11y-btn.on { color: var(--red); border-color: var(--red); background: var(--red-tint); }
.a11y-btn[aria-expanded="true"] { color: var(--ink); border-color: var(--line-strong); background: var(--hover); }

.a11y-panel {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 60;
  width: 300px; padding: 14px 16px 6px;
  background: var(--card); border: 1px solid var(--line-strong); border-radius: 8px;
  box-shadow: 0 12px 32px var(--shadow-strong);
  text-align: left;
}
.a11y-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.a11y-head b { font-size: 14px; }
.a11y-reset { font: inherit; font-size: 12px; color: var(--red); background: none; border: 0; cursor: pointer; padding: 2px 0; }
.a11y-reset:disabled { color: var(--sub); cursor: default; opacity: .6; }

.a11y-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); cursor: default; }
label.a11y-row { cursor: pointer; }
.a11y-name { font-size: 13.5px; font-weight: 600; color: var(--ink); display: flex; flex-direction: column; gap: 2px; }
.a11y-name small { font-size: 11.5px; font-weight: 400; color: var(--sub); }

.a11y-seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; flex-shrink: 0; }
.a11y-seg button { font: inherit; font-size: 12.5px; padding: 6px 10px; border: 0; background: transparent; color: var(--sub); cursor: pointer; white-space: nowrap; }
.a11y-seg button + button { border-left: 1px solid var(--line-strong); }
.a11y-seg button.on { background: var(--red); color: #fff; font-weight: 600; }

.a11y-switch { appearance: none; width: 38px; height: 22px; border-radius: 999px; background: var(--line-strong); position: relative; cursor: pointer; flex-shrink: 0; margin: 0; transition: background .18s; }
.a11y-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: left .18s; }
.a11y-switch:checked { background: var(--red); }
.a11y-switch:checked::after { left: 19px; }
.a11y-switch:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

@media (max-width: 640px) {
  .a11y-label { display: none; }
  .a11y-btn { padding: 5px 6px; }
  .a11y-panel { width: min(300px, calc(100vw - 32px)); }
}
</style>
