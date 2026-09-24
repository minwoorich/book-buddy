/**
 * 모임 시각 표시. 저장은 ISO(UTC), 표시는 항상 KST — 서버(알림 문구)와 앱(화면)이 같은 함수를 쓴다.
 * Intl 대신 고정 오프셋(+09:00)으로 계산한다: 한국은 DST가 없고, 이 함수는 Node·브라우저 어디서
 * 실행돼도 같은 문자열을 내야 한다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

function kst(iso: string): Date {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS)
}

const two = (n: number) => String(n).padStart(2, '0')

/** UTC Date → KST 벽시계 성분. weekday는 0=일 … 6=토. 서버(슬롯 생성·잠금)와 앱(잠금 표시)이 같은 함수를 쓴다. */
export function kstParts(date: Date): { y: number; m: number; d: number; weekday: number; h: number; min: number } {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    h: shifted.getUTCHours(),
    min: shifted.getUTCMinutes(),
  }
}

/** "9/25(금)" */
export function formatKstDate(iso: string): string {
  const d = kst(iso)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`
}

/** "19:00" */
export function formatKstTime(iso: string): string {
  const d = kst(iso)
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
}

/** "9/25(금) 19:00" */
export function formatKst(iso: string): string {
  return `${formatKstDate(iso)} ${formatKstTime(iso)}`
}
