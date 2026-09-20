/**
 * 최소한의 iCalendar 문서. 외부 라이브러리 없이 한 이벤트만 만든다 — 아웃룩·구글 캘린더에
 * 그대로 들어간다. 줄 끝은 CRLF, 시각은 UTC(`Z`).
 */
export interface IcsInput {
  uid: string
  startIso: string
  endIso: string
  summary: string
  description: string
  location?: string | null
  stampIso: string
}

/** RFC 5545 TEXT 이스케이프: 백슬래시·세미콜론·쉼표·줄바꿈. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** 2026-09-25T10:00:00.000Z → 20260925T100000Z */
function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function buildIcs(input: IcsInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VATECH LIBRARY//book-buddy//KO',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${icsStamp(input.stampIso)}`,
    `DTSTART:${icsStamp(input.startIso)}`,
    `DTEND:${icsStamp(input.endIso)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
  ]
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
