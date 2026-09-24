import type { Club } from '../types'

/**
 * 모임 제목 한 가지 규칙 — 카드·상세·알림·ics·달력이 전부 이걸 쓴다.
 * 사람 모임은 개설자가 쓴 제목, 에이전트 모임(또는 제목이 비어 있으면) 『책』 책모임.
 */
export function clubTitle(club: Pick<Club, 'origin' | 'title' | 'bookTitle'>): string {
  const t = club.title?.trim() ?? ''
  if (club.origin === 'user' && t.length > 0) return t
  return `『${club.bookTitle}』 책모임`
}
