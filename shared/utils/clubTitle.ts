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

/** 받침 유무로 조사를 고른다. 마지막 글자가 한글 음절이 아니면(숫자·영문·기호) 받침 없는 쪽. */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const w = word.trim()
  const last = w.charCodeAt(w.length - 1)
  const hangul = last >= 0xac00 && last <= 0xd7a3
  return hangul && (last - 0xac00) % 28 !== 0 ? withFinal : withoutFinal
}
