import { BP_MOBILE } from './useShelfColumns'

/** 모바일 폭(≤640px) 여부. SSR/비브라우저에선 false. main.css의 @media 값과 맞춘다. */
export function useIsMobile() {
  const isMobile = ref(false)

  if (import.meta.client && typeof window.matchMedia === 'function') {
    const query = window.matchMedia(`(max-width: ${BP_MOBILE}px)`)
    const update = () => {
      isMobile.value = query.matches
    }
    update()
    onMounted(() => query.addEventListener('change', update))
    onUnmounted(() => query.removeEventListener('change', update))
  }

  return isMobile
}
