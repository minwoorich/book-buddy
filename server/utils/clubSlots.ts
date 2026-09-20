import { CLUB_RULES } from './clubRules'

/** 한국은 DST가 없다 — 고정 오프셋으로 계산한다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** 후보는 평일(월~금)만 — 달력 불변량이라 CLUB_RULES가 아니라 여기 둔다. */
const WEEKDAYS_PER_WEEK = 5

/** 모임 시간 창(스펙 §5.2). 시작 시각은 KST 벽시계. */
export const SLOT_WINDOWS = [
  { key: 'lunch', startHour: 12, startMinute: 0, minutes: 60 },
  { key: 'evening', startHour: 18, startMinute: 30, minutes: 90 },
] as const

/** KST 벽시계(y, m 1~12, d, h, min) → UTC Date. */
export function kstDate(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min) - KST_OFFSET_MS)
}

/** UTC Date → KST 벽시계 성분. weekday는 0=일 … 6=토. */
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

/** now 기준 "다음 주 월요일 00:00 KST". 그날까지 minLeadDays 미만이면 그다음 주. */
export function nextWeekMondayKst(now: Date): Date {
  const p = kstParts(now)
  const today = kstDate(p.y, p.m, p.d, 0, 0)
  const daysUntilNextMonday = ((8 - p.weekday) % 7) || 7
  let monday = new Date(today.getTime() + daysUntilNextMonday * DAY_MS)
  if (monday.getTime() - now.getTime() < CLUB_RULES.minLeadDays * DAY_MS) {
    monday = new Date(monday.getTime() + 7 * DAY_MS)
  }
  return monday
}

/** 슬롯의 길이 — KST 시각으로 어느 창인지 판별한다. */
export function slotDurationMinutes(iso: string): number {
  const { h } = kstParts(new Date(iso))
  const win = SLOT_WINDOWS.find((w) => w.startHour === h) ?? SLOT_WINDOWS[1]
  return win.minutes
}

export function slotEndIso(iso: string): string {
  return new Date(new Date(iso).getTime() + slotDurationMinutes(iso) * 60 * 1000).toISOString()
}

export interface SlotConstraints {
  now: Date
  /** 참가자들의 다른 확정 모임 구간(ISO). 겹치면 제외. */
  busy: { start: string; end: string }[]
  /** 아직 책을 대출 중인 참가자의 가장 이른 반납 예정일(ISO). 슬롯이 이 시각 안에 끝나야 한다. */
  mustEndBefore: string | null
  /** 사업장이 2곳 이상 섞였으면 이동시간을 고려해 저녁을 먼저 채운다. */
  preferEvening: boolean
}

function overlaps(startMs: number, endMs: number, busy: { start: string; end: string }[]): boolean {
  return busy.some((b) => startMs < new Date(b.end).getTime() && new Date(b.start).getTime() < endMs)
}

/**
 * 다음 주 월~금 × 창 2개 = 10개 후보에서 제약을 거른 뒤 상위 N개. 결과는 항상 시간순.
 * preferEvening이면 저녁 슬롯을 먼저 채우고, 부족할 때만 점심으로 메운다.
 */
export function generateCandidateSlots(c: SlotConstraints): string[] {
  const monday = nextWeekMondayKst(c.now)
  const mp = kstParts(monday)

  const all: { iso: string; key: (typeof SLOT_WINDOWS)[number]['key'] }[] = []
  for (let day = 0; day < WEEKDAYS_PER_WEEK; day += 1) {
    for (const w of SLOT_WINDOWS) {
      const start = kstDate(mp.y, mp.m, mp.d + day, w.startHour, w.startMinute)
      const end = new Date(start.getTime() + w.minutes * 60 * 1000)
      if (c.mustEndBefore && end.getTime() > new Date(c.mustEndBefore).getTime()) continue
      if (overlaps(start.getTime(), end.getTime(), c.busy)) continue
      all.push({ iso: start.toISOString(), key: w.key })
    }
  }

  const ordered = c.preferEvening
    ? [...all.filter((s) => s.key === 'evening'), ...all.filter((s) => s.key !== 'evening')]
    : all
  return ordered
    .slice(0, CLUB_RULES.slotCandidates)
    .map((s) => s.iso)
    .sort()
}
