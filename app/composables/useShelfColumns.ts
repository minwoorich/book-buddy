/** 반응형 브레이크포인트 — main.css의 @media 값과 맞춘다. */
export const BP_TABLET = 900
export const BP_MOBILE = 640

/**
 * 뷰포트 폭에 따라 서가 한 줄의 책 칸 수를 고른다.
 * 서가는 "표지 줄 → 선반 → 제목 줄"을 한 묶음으로 렌더하므로 CSS만으로 칸 수를 바꾸면
 * 선반이 줄 중간에 끼어든다 — 그래서 JS에서 칸 수를 정해 줄을 다시 나눈다.
 */
export function useShelfColumns(desktop: number, tablet: number, mobile: number) {
  const columns = ref(desktop)

  if (import.meta.client && typeof window.matchMedia === 'function') {
    const tabletQuery = window.matchMedia(`(max-width: ${BP_TABLET}px)`)
    const mobileQuery = window.matchMedia(`(max-width: ${BP_MOBILE}px)`)

    const update = () => {
      columns.value = mobileQuery.matches ? mobile : tabletQuery.matches ? tablet : desktop
    }
    update()

    onMounted(() => {
      tabletQuery.addEventListener('change', update)
      mobileQuery.addEventListener('change', update)
    })
    onUnmounted(() => {
      tabletQuery.removeEventListener('change', update)
      mobileQuery.removeEventListener('change', update)
    })
  }

  return columns
}
