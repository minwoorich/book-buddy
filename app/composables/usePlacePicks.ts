import type { PlaceRecommendation } from '#shared/types'

/**
 * 책벗이 추천한 장소를 채팅 → /places로 건네는 자리.
 *
 * 장소 id를 URL에 실어 보내지 않는 이유: 카카오 로컬에는 id 단건 조회가 없어서 /places가
 * 그 id로 장소를 되살릴 방법이 없다. 같은 SPA 안의 이동이므로 좌표까지 든 객체를 그대로
 * 넘기고, URL에는 `?office=msys&picks=1`처럼 "어느 사업장인지 · 추천만 볼지"만 남긴다.
 * 새로고침으로 state가 날아가도 복원되도록 sessionStorage에 같이 둔다(탭을 닫으면 초기화).
 */
const KEY = 'bb:places:picks'

function restore(): PlaceRecommendation | null {
  if (!import.meta.client) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as PlaceRecommendation) : null
    return parsed && Array.isArray(parsed.places) ? parsed : null
  } catch {
    return null
  }
}

function persist(rec: PlaceRecommendation | null) {
  if (!import.meta.client) return
  try {
    if (rec) sessionStorage.setItem(KEY, JSON.stringify(rec))
    else sessionStorage.removeItem(KEY)
  } catch {
    // 저장 실패(프라이빗 모드·용량 초과)는 무시 — 이동 자체를 막으면 안 된다.
  }
}

export function usePlacePicks() {
  const picks = useState<PlaceRecommendation | null>(KEY, () => restore())

  function set(rec: PlaceRecommendation | null) {
    picks.value = rec
    persist(rec)
  }

  function clear() {
    set(null)
  }

  return { picks, set, clear }
}
