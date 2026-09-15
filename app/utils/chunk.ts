/** 배열을 size개씩 줄 단위로 나눈다 — 서가(선반) 한 줄에 들어갈 책을 묶을 때 쓴다. */
export function chunk<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size))
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += step) {
    rows.push(items.slice(i, i + step))
  }
  return rows
}
