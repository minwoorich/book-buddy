/**
 * SQLite의 `datetime('now')`가 만드는 `'YYYY-MM-DD HH:MM:SS'` 문자열은 UTC 값이지만
 * `'T'`/`'Z'`가 없어 `new Date(value)`로 넘기면 브라우저/Node가 로컬 시간으로 오해한다.
 * (KST 기준 00:00~08:59 시각의 UTC 타임스탬프가 하루 전 날짜로 집계되는 원인.)
 *
 * loaned_at/returned_at/created_at처럼 DB 기본값(datetime('now'))으로 채워지는 컬럼은
 * 이 헬퍼로 파싱해야 한다. due_at처럼 애플리케이션이 직접 ISO 문자열(`Z` 포함)로 채우는
 * 컬럼은 `new Date(value)`로도 이미 올바르게 UTC로 해석되므로 그대로 써도 된다.
 */
export function parseDbDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}Z`)
  }
  return new Date(value)
}
