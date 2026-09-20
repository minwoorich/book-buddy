/**
 * 목록 컨테이너 "안에서만" 스크롤하기.
 *
 * element.scrollIntoView()는 조건을 맞추려고 스크롤 가능한 조상을 전부 움직인다 — 모바일
 * 장소 페이지는 지도 아래에 목록이 길게 이어지는 구조라, 핀을 누르면 창까지 따라 내려가
 * 지도가 화면 밖으로 사라졌다. 그래서 컨테이너의 scrollTop만 직접 계산해 바꾼다.
 */

export interface ScrollTarget {
  /** 컨테이너의 현재 scrollTop */
  viewTop: number
  /** 컨테이너의 보이는 높이(clientHeight) */
  viewHeight: number
  /** 컨테이너 내용 기준 항목의 위쪽 위치(offsetTop) */
  itemTop: number
  itemHeight: number
  /** 위아래로 남길 여백 */
  margin: number
}

/** 새 scrollTop. 이미 다 보이면 null(움직이지 않는다). */
export function scrollTopFor({ viewTop, viewHeight, itemTop, itemHeight, margin }: ScrollTarget): number | null {
  const itemBottom = itemTop + itemHeight
  const viewBottom = viewTop + viewHeight
  if (itemTop >= viewTop && itemBottom <= viewBottom) return null

  // 항목이 화면보다 크면 아래 끝에 맞출 수 없다 — 시작 부분이 보이게 한다.
  const tallerThanView = itemHeight + margin * 2 > viewHeight
  const next = tallerThanView || itemTop < viewTop ? itemTop - margin : itemBottom + margin - viewHeight
  return Math.max(0, next)
}

/** 컨테이너 안에서 항목이 보이도록 부드럽게 스크롤한다. 이미 보이면 아무 일도 하지 않는다. */
export function scrollWithin(container: HTMLElement, item: HTMLElement, margin = 12): void {
  const top = scrollTopFor({
    viewTop: container.scrollTop,
    viewHeight: container.clientHeight,
    itemTop: item.offsetTop - container.offsetTop,
    itemHeight: item.offsetHeight,
    margin,
  })
  if (top !== null) container.scrollTo({ top, behavior: 'smooth' })
}
