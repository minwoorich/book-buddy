import {
  A11Y_DEFAULTS,
  A11Y_STORAGE_KEY,
  applyA11yPrefs,
  normalizeA11yPrefs,
  type A11yPrefs,
} from '../utils/a11yPrefs'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 현재 설정을 DOM에 반영한다. 브라우저 밖에서는 아무것도 하지 않는다. */
export function syncA11yToDom(prefs: A11yPrefs): void {
  if (!import.meta.client) return
  const osDark = typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
  applyA11yPrefs(document.documentElement, prefs, osDark)
}

/**
 * 접근성 설정 컴포저블. 상태는 useState로 앱 전역 공유, 저장은 localStorage(`bb:a11y`).
 * 앱 시작 시 복원은 `app/plugins/restore-a11y.client.ts`가 맡는다.
 */
export function useA11y() {
  const prefs = useState<A11yPrefs>('bb:a11y', () => ({ ...A11Y_DEFAULTS }))

  function persist(p: A11yPrefs) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(p))
    } catch {
      // localStorage 접근 실패(프라이빗 모드 등)는 무시한다.
    }
  }

  function set(patch: Partial<A11yPrefs>) {
    const next = normalizeA11yPrefs({ ...prefs.value, ...patch })
    prefs.value = next
    syncA11yToDom(next)
    persist(next)
  }

  function reset() {
    set({ ...A11Y_DEFAULTS })
  }

  const isDefault = computed(
    () =>
      prefs.value.text === A11Y_DEFAULTS.text &&
      prefs.value.simple === A11Y_DEFAULTS.simple &&
      prefs.value.cvd === A11Y_DEFAULTS.cvd &&
      prefs.value.theme === A11Y_DEFAULTS.theme
  )

  return { prefs, set, reset, isDefault }
}
