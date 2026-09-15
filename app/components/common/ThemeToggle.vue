<script setup lang="ts">
import { nextThemePref, resolveTheme } from '../../utils/a11yPrefs'

/**
 * 다크모드 스위치 — 헤더·로그인·회원가입 우측 상단.
 * 설정은 접근성 메뉴와 같은 저장소(useA11y / `bb:a11y`)를 쓰므로 둘 중 무엇으로 바꿔도 값이 일치한다.
 * `system`(기본값)일 때는 OS 설정을 따라 스위치가 놓이고, 한 번 누르면 명시적으로 고정된다.
 */
const { prefs, set } = useA11y()

const osPrefersDark = ref(false)
let media: MediaQueryList | undefined

function syncOs(e: MediaQueryListEvent | MediaQueryList) {
  osPrefersDark.value = e.matches
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  media = window.matchMedia('(prefers-color-scheme: dark)')
  syncOs(media)
  media.addEventListener('change', syncOs)
})
onUnmounted(() => media?.removeEventListener('change', syncOs))

const isDark = computed(() => resolveTheme(prefs.value.theme, osPrefersDark.value) === 'dark')

function toggle() {
  set({ theme: nextThemePref(prefs.value.theme, osPrefersDark.value) })
}
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :class="{ on: isDark }"
    role="switch"
    :aria-checked="isDark"
    :title="isDark ? '라이트 모드로 전환' : '다크 모드로 전환'"
    aria-label="다크 모드"
    @click="toggle"
  >
    <span class="track">
      <span class="knob">
        <svg v-if="isDark" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
        <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4" />
        </svg>
      </span>
    </span>
    <span class="theme-label">{{ isDark ? '다크' : '라이트' }}</span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex; align-items: center; gap: 7px;
  font: inherit; font-size: 12.5px; color: var(--sub);
  background: none; border: 0; padding: 4px 2px; cursor: pointer;
}
.theme-toggle:hover { color: var(--ink); }
.theme-toggle:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; border-radius: 999px; }

.track {
  position: relative; flex-shrink: 0;
  width: 44px; height: 24px; border-radius: 999px;
  background: var(--card-2); border: 1px solid var(--line-strong);
  transition: background .18s, border-color .18s;
}
.theme-toggle.on .track { background: var(--red-tint); border-color: var(--red); }

/* 아이콘은 노브 안에 둔다 — 지금 켜져 있는 테마를 그대로 보여주기 위해(라벨과 같은 방향). */
.knob {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--card); color: var(--ink);
  box-shadow: 0 1px 3px var(--shadow-strong);
  transition: left .18s, background .18s, color .18s;
}
.theme-toggle.on .knob { left: 22px; background: var(--red); color: #fff; }

@media (max-width: 640px) {
  .theme-label { display: none; }
}
</style>
