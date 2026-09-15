/**
 * 접근성 설정(글자 크기·단순 화면·색약 모드·테마)의 순수 로직.
 * DOM·Nuxt에 의존하지 않아 vitest로 검증하고, 컴포저블(useA11y)과 복원 플러그인이 공유한다.
 * 설정은 계정이 아닌 기기 단위(localStorage `bb:a11y`)로 저장한다 — 시력·기기 환경은 계정보다
 * 기기에 묶이고, 비로그인 게스트도 써야 하기 때문.
 */

export const A11Y_STORAGE_KEY = 'bb:a11y'

export const TEXT_SIZES = ['normal', 'large', 'xlarge'] as const
export const THEMES = ['system', 'light', 'dark'] as const

export type TextSize = (typeof TEXT_SIZES)[number]
export type ThemePref = (typeof THEMES)[number]
export type ResolvedTheme = 'light' | 'dark'

export type A11yPrefs = {
  /** 글자 크기 — html { zoom } 100% / 130% / 160% */
  text: TextSize
  /** 단순 화면 — 장식 제거, 링크 밑줄, 큰 터치 영역 */
  simple: boolean
  /** 색각 이상(color vision deficiency) 모드 — 의미 색을 파랑/주황 계열로, 기호 단서 추가 */
  cvd: boolean
  theme: ThemePref
}

export const A11Y_DEFAULTS: Readonly<A11yPrefs> = Object.freeze({
  text: 'normal',
  simple: false,
  cvd: false,
  theme: 'system',
})

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** 알 수 없는 값·빠진 필드·잘못된 타입은 모두 기본값으로 대체한다. 항상 새 객체를 돌려준다. */
export function normalizeA11yPrefs(input: unknown): A11yPrefs {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    text: pickEnum(src.text, TEXT_SIZES, A11Y_DEFAULTS.text),
    simple: typeof src.simple === 'boolean' ? src.simple : A11Y_DEFAULTS.simple,
    cvd: typeof src.cvd === 'boolean' ? src.cvd : A11Y_DEFAULTS.cvd,
    theme: pickEnum(src.theme, THEMES, A11Y_DEFAULTS.theme),
  }
}

/** localStorage 원문(JSON 문자열 또는 null)을 설정 객체로. 깨진 JSON은 기본값. */
export function parseA11yPrefs(raw: string | null | undefined): A11yPrefs {
  if (!raw) return normalizeA11yPrefs(null)
  try {
    return normalizeA11yPrefs(JSON.parse(raw))
  } catch {
    return normalizeA11yPrefs(null)
  }
}

export function resolveTheme(pref: ThemePref, osPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return osPrefersDark ? 'dark' : 'light'
  return pref
}

/**
 * 다크모드 스위치를 눌렀을 때의 다음 설정. 지금 화면에 보이는 테마의 반대로 **명시적으로** 고정한다
 * (system이었다면 OS를 따르던 상태가 풀린다 — 스위치를 눌렀다는 건 직접 정하겠다는 뜻).
 */
export function nextThemePref(pref: ThemePref, osPrefersDark: boolean): ResolvedTheme {
  return resolveTheme(pref, osPrefersDark) === 'dark' ? 'light' : 'dark'
}

/** setAttribute/removeAttribute만 있으면 되므로 테스트에서 가짜 객체를 넣을 수 있다. */
export type AttrTarget = {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/**
 * 설정을 `<html>`의 data-* 속성으로 반영한다. CSS는 이 속성만 보고 동작한다.
 * 기본값인 항목은 속성을 지워 기본 스타일이 그대로 적용되게 한다 (data-theme만 항상 기록).
 */
export function applyA11yPrefs(root: AttrTarget, prefs: A11yPrefs, osPrefersDark: boolean): void {
  if (prefs.text === 'normal') root.removeAttribute('data-text')
  else root.setAttribute('data-text', prefs.text)

  if (prefs.simple) root.setAttribute('data-simple', 'true')
  else root.removeAttribute('data-simple')

  if (prefs.cvd) root.setAttribute('data-cvd', 'true')
  else root.removeAttribute('data-cvd')

  root.setAttribute('data-theme', resolveTheme(prefs.theme, osPrefersDark))
}
