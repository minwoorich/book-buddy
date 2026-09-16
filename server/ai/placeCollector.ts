import type { ChatAction, Place, PlaceRecommendation } from '../../shared/types'
import { createMentionTest } from './placeMention'

/**
 * 장소 검색 도구가 실제로 쓴 사업장과 돌려준 원본 장소를 요청 범위에서 모아 둔다.
 *
 * 모델에게 주는 JSON에는 좌표가 없다(모델이 쓰지 않는 값이라 토큰만 먹는다). 지도에 찍으려면
 * 좌표가 필요하므로, 도구가 결과를 사이드 채널로 한 번 더 흘려보내고 runAgent가 그걸 읽는다.
 * 덕분에 모델 쪽 payload는 그대로 두면서 주소·거리·placeUrl까지 온전한 Place를 쓸 수 있다.
 */
export interface PlaceSearchRecord {
  officeKey: string
  places: Place[]
}

export interface PlaceCollector {
  record(rec: PlaceSearchRecord): void
  records(): PlaceSearchRecord[]
}

export function createPlaceCollector(): PlaceCollector {
  const list: PlaceSearchRecord[] = []
  return {
    record: (rec) => void list.push(rec),
    records: () => list,
  }
}

/** 같은 장소를 두 번 담지 않기 위한 키. 폴백 장소처럼 id가 없으면 이름으로 센다. */
function placeKey(p: Place): string {
  return p.kakaoId ?? p.name
}

/**
 * 모아 둔 검색 결과와 답변 본문으로 "이번에 추천한 장소"를 정한다.
 *
 * 이름을 하나도 안 불렀으면 장소는 비우고 사업장만 남긴다 — 검색은 했으니 지도 기준점을
 * 옮기는 건 맞지만, 부르지도 않은 곳을 "책벗이 추천한 곳"이라고 찍는 건 거짓말이 된다.
 * 장소 검색을 아예 안 한 턴(후기 도구만 쓴 경우 등)은 옮길 기준점도 없으므로 null.
 */
export function pickRecommendation(records: PlaceSearchRecord[], answerText: string): PlaceRecommendation | null {
  const last = records.at(-1)
  if (!last) return null

  const seen = new Set<string>()
  const all: Place[] = []
  for (const rec of records) {
    for (const p of rec.places) {
      const key = placeKey(p)
      if (seen.has(key)) continue
      seen.add(key)
      all.push(p)
    }
  }

  const mentions = createMentionTest(answerText)
  return { officeKey: last.officeKey, places: all.filter((p) => mentions(p.name)) }
}

/** 추천이 실린 /places 경로. picks=1이면 클라이언트가 들고 있는 추천 장소만 그린다. */
function placesPath(rec: PlaceRecommendation): string {
  const query = `office=${encodeURIComponent(rec.officeKey)}`
  return rec.places.length > 0 ? `/places?${query}&picks=1` : `/places?${query}`
}

/**
 * /places 이동 버튼이 사업장·추천 장소를 함께 들고 가도록 고쳐 쓴다. 버튼이 없으면 만든다.
 *
 * 경로를 서버에서 만드는 이유: 모델이 쿼리를 직접 짜게 두면 화이트리스트(parse.ts)를 열어야
 * 하고, 그러면 임의 경로를 만들어낼 틈이 생긴다. 모델은 `/places`만 말할 수 있게 두고
 * 나머지는 도구가 실제로 쓴 값으로 서버가 채운다.
 */
export function withPlaceAction(actions: ChatAction[], rec: PlaceRecommendation | null): ChatAction[] {
  if (!rec) return actions

  const to = placesPath(rec)
  const label = rec.places.length > 0 ? `추천한 ${rec.places.length}곳 지도에서 보기` : null
  const i = actions.findIndex((a) => a.type === 'navigate' && a.to.startsWith('/places'))
  if (i === -1) {
    return [...actions, { type: 'navigate', label: label ?? '책 읽기 좋은 장소 보기', to }]
  }

  const next = [...actions]
  const current = next[i] as Extract<ChatAction, { type: 'navigate' }>
  next[i] = { type: 'navigate', label: label ?? current.label, to }
  return next
}
