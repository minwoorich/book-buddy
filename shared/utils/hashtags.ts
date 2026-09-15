/**
 * 피드 해시태그 규칙 — 클라이언트(칩 입력)와 서버(저장 전 정규화)가 같은 함수를 쓴다.
 * 인스타처럼 캡션 안의 `#태그`도 태그로 인정하되, 저장은 post_tags 한 곳에만 한다.
 */

export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 20

/** 태그 한 개 정규화: 앞의 # 제거, 글자·숫자·밑줄 외 문자 제거, 길이 제한. 남는 게 없으면 ''. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, MAX_TAG_LENGTH)
}

/** 목록 정규화: 빈 값 제거, 대소문자 무시 중복 제거(먼저 나온 표기 유지), 최대 MAX_TAGS개. */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    const tag = normalizeTag(item)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= MAX_TAGS) break
  }
  return result
}

/** 캡션 본문 안의 `#태그`를 나온 순서대로 뽑는다(정규화 전). */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return []
  const found: string[] = []
  for (const match of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) found.push(match[1] as string)
  return found
}

/** 명시 태그 + 캡션 태그 합치기. 명시 태그가 앞에 온다. */
export function mergeTags(explicit: string[], caption: string | null | undefined): string[] {
  return normalizeTags([...explicit, ...extractHashtags(caption)])
}

/** 폼/JSON 필드 파싱: JSON 배열(`["a","b"]`) 또는 쉼표·줄바꿈 구분 문자열. 그 외는 빈 배열. */
export function parseTagsField(raw: string | null | undefined): string[] {
  if (!raw) return []
  const text = raw.trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (!Array.isArray(parsed)) return []
      return normalizeTags(parsed.filter((v): v is string => typeof v === 'string'))
    } catch {
      return []
    }
  }
  if (text.startsWith('{')) return []
  return normalizeTags(text.split(/[,\n]/))
}
