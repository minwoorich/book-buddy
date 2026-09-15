import { syncA11yToDom, useA11y } from '../composables/useA11y'
import { A11Y_STORAGE_KEY, parseA11yPrefs } from '../utils/a11yPrefs'

/**
 * 앱 시작 시 localStorage(`bb:a11y`)의 접근성 설정을 복원해 <html> data-* 속성에 반영한다.
 * 테마가 'system'이면 OS 다크모드 변경도 따라간다.
 */
export default defineNuxtPlugin(() => {
  const { prefs } = useA11y()

  let raw: string | null = null
  try {
    raw = localStorage.getItem(A11Y_STORAGE_KEY)
  } catch {
    // localStorage 접근 실패(프라이빗 모드 등)는 기본값으로 진행.
  }
  prefs.value = parseA11yPrefs(raw)
  syncA11yToDom(prefs.value)

  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (prefs.value.theme === 'system') syncA11yToDom(prefs.value)
    })
  }
})
