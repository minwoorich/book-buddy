/**
 * 장소 후기 태그 6종. DB에는 code만 저장하고 라벨은 여기서 읽는다.
 * 마지막 `noisy`는 부정 태그 — 솔직한 신호를 남길 수 있게 하나 둔다.
 */
export const PLACE_TAGS = [
  { code: 'quiet', label: '조용해요' },
  { code: 'outlet', label: '콘센트 있어요' },
  { code: 'spacious', label: '자리 넓어요' },
  { code: 'long-stay', label: '오래 있기 좋아요' },
  { code: 'bright', label: '채광 좋아요' },
  { code: 'noisy', label: '시끄러워요' },
] as const

export type PlaceTagCode = (typeof PLACE_TAGS)[number]['code']

export const PLACE_TAG_LABEL: Record<PlaceTagCode, string> = Object.fromEntries(
  PLACE_TAGS.map((t) => [t.code, t.label])
) as Record<PlaceTagCode, string>

const CODE_SET: ReadonlySet<string> = new Set(PLACE_TAGS.map((t) => t.code))

export function isPlaceTagCode(value: unknown): value is PlaceTagCode {
  return typeof value === 'string' && CODE_SET.has(value)
}
