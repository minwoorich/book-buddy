/**
 * Date를 SQLite의 datetime('now') 포맷(`YYYY-MM-DD HH:MM:SS`, UTC)으로 바꾼다.
 *
 * DB에 쌓인 created_at·returned_at과 문자열로 비교할 때는 반드시 이걸 쓴다.
 * toISOString()을 그대로 쓰면 'T'와 공백 때문에 같은 날짜의 대소가 뒤집힌다.
 */
export function toDbTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

/** SQLite datetime 포맷('YYYY-MM-DD HH:MM:SS', UTC)이면 ISO로 바꾼다. 이미 ISO면 그대로. */
export function fromDbTime(value: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}.000Z` : value
}
