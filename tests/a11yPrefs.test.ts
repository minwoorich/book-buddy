import { describe, expect, it } from 'vitest'
import {
  A11Y_DEFAULTS,
  applyA11yPrefs,
  normalizeA11yPrefs,
  parseA11yPrefs,
  resolveTheme,
} from '../app/utils/a11yPrefs'

describe('normalizeA11yPrefs', () => {
  it('returns defaults for null/undefined/non-object input', () => {
    expect(normalizeA11yPrefs(null)).toEqual(A11Y_DEFAULTS)
    expect(normalizeA11yPrefs(undefined)).toEqual(A11Y_DEFAULTS)
    expect(normalizeA11yPrefs('large')).toEqual(A11Y_DEFAULTS)
    expect(normalizeA11yPrefs(42)).toEqual(A11Y_DEFAULTS)
  })

  it('keeps valid fields and fills missing ones with defaults', () => {
    expect(normalizeA11yPrefs({ text: 'large', cvd: true })).toEqual({
      ...A11Y_DEFAULTS,
      text: 'large',
      cvd: true,
    })
  })

  it('replaces unknown enum values and non-boolean flags with defaults', () => {
    expect(normalizeA11yPrefs({ text: 'huge', theme: 'sepia', simple: 'yes', cvd: 1 })).toEqual(A11Y_DEFAULTS)
  })

  it('does not return the defaults object itself (callers may mutate)', () => {
    expect(normalizeA11yPrefs(null)).not.toBe(A11Y_DEFAULTS)
  })
})

describe('parseA11yPrefs', () => {
  it('parses stored JSON', () => {
    expect(parseA11yPrefs('{"theme":"dark","simple":true}')).toEqual({ ...A11Y_DEFAULTS, theme: 'dark', simple: true })
  })

  it('falls back to defaults on broken JSON or empty storage', () => {
    expect(parseA11yPrefs('{oops')).toEqual(A11Y_DEFAULTS)
    expect(parseA11yPrefs(null)).toEqual(A11Y_DEFAULTS)
    expect(parseA11yPrefs('')).toEqual(A11Y_DEFAULTS)
  })
})

describe('resolveTheme', () => {
  it('returns explicit light/dark as-is regardless of OS preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows OS preference when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('applyA11yPrefs', () => {
  function fakeRoot() {
    const attrs = new Map<string, string>()
    return {
      attrs,
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    }
  }

  it('writes data-* attributes for every preference', () => {
    const root = fakeRoot()
    applyA11yPrefs(root, { text: 'xlarge', simple: true, cvd: true, theme: 'dark' }, false)
    expect(Object.fromEntries(root.attrs)).toEqual({
      'data-text': 'xlarge',
      'data-simple': 'true',
      'data-cvd': 'true',
      'data-theme': 'dark',
    })
  })

  it('removes attributes when a preference is at its default so base CSS wins', () => {
    const root = fakeRoot()
    applyA11yPrefs(root, { text: 'large', simple: true, cvd: true, theme: 'dark' }, false)
    applyA11yPrefs(root, A11Y_DEFAULTS, false)
    expect(Object.fromEntries(root.attrs)).toEqual({ 'data-theme': 'light' })
  })

  it('resolves system theme with the OS flag', () => {
    const root = fakeRoot()
    applyA11yPrefs(root, { ...A11Y_DEFAULTS, theme: 'system' }, true)
    expect(root.attrs.get('data-theme')).toBe('dark')
  })
})
