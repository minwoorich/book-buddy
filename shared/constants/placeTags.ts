/**
 * 장소 후기 태그 6종. DB에는 code만 저장하고 라벨은 여기서 읽는다.
 * 마지막 `noisy`는 부정 태그 — 솔직한 신호를 남길 수 있게 하나 둔다.
 *
 * `emoji`는 화면에서 태그 배지 앞에 붙이는 표식이다. 여러 태그가 나란히 놓이면 글자만으로는
 * 경계가 흐려서 하나로 읽힌다. `label`에 섞지 않고 따로 두는 이유는, 라벨이 AI 프롬프트와
 * 후기 다이제스트(placeReviewDigest·searchReviewedPlaces)에도 그대로 쓰이기 때문이다.
 */
export const PLACE_TAGS = [
  { code: 'quiet', label: '조용해요', emoji: '🤫' },
  { code: 'outlet', label: '콘센트 있어요', emoji: '🔌' },
  { code: 'spacious', label: '자리 넓어요', emoji: '🪑' },
  { code: 'long-stay', label: '오래 있기 좋아요', emoji: '⏳' },
  { code: 'bright', label: '채광 좋아요', emoji: '☀️' },
  { code: 'noisy', label: '시끄러워요', emoji: '🔊' },
] as const

export type PlaceTagCode = (typeof PLACE_TAGS)[number]['code']

export const PLACE_TAG_LABEL: Record<PlaceTagCode, string> = Object.fromEntries(
  PLACE_TAGS.map((t) => [t.code, t.label])
) as Record<PlaceTagCode, string>

export const PLACE_TAG_EMOJI: Record<PlaceTagCode, string> = Object.fromEntries(
  PLACE_TAGS.map((t) => [t.code, t.emoji])
) as Record<PlaceTagCode, string>

const CODE_SET: ReadonlySet<string> = new Set(PLACE_TAGS.map((t) => t.code))

export function isPlaceTagCode(value: unknown): value is PlaceTagCode {
  return typeof value === 'string' && CODE_SET.has(value)
}
