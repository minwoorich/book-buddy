import type { PlaceEvidence } from '../../shared/types'
import { createMentionTest } from './placeMention'

/**
 * 장소 추천의 "근거 보기"에 쓸 사내 후기를 도구 결과에서 직접 뽑아낸다.
 *
 * 모델에게 근거를 액션으로 만들어 달라고 시키지 않는 이유: 없는 후기를 지어내거나
 * 장소 이름을 흘릴 여지를 두지 않기 위해서다. 실제로 도구가 돌려준 값만 근거가 된다
 * (enrich.ts가 빠진 버튼을 서버에서 결정적으로 채우는 것과 같은 결).
 */

/** 근거를 만들 수 있는 도구 — 둘 다 후기 요약(total/tags/comments)을 내려준다. */
const PLACE_TOOLS = new Set(['search_reading_places', 'search_reviewed_places'])

/** 이름이 하나도 안 걸렸을 때 보여줄 최대 곳 수. */
const FALLBACK_MAX = 3

/** 에이전트 실행 결과 메시지 중 우리가 읽는 부분만. */
export interface ToolMessageLike {
  name?: string
  content: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function toCounts(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {}
  return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number')) as Record<string, number>
}

/**
 * 한 장소 항목을 근거로 바꾼다. 후기가 없는 장소(reviews 키 자체가 없는 경우)는 null —
 * 근거로 내세울 게 없는 곳까지 버튼에 담지 않는다.
 */
function toEvidence(raw: unknown): PlaceEvidence | null {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.mapUrl !== 'string') return null
  // search_reading_places는 reviews 아래에, search_reviewed_places는 항목 자체에 후기를 담는다.
  const reviews = isRecord(raw.reviews) ? raw.reviews : raw
  const total = typeof reviews.total === 'number' ? reviews.total : 0
  if (total <= 0) return null
  return {
    name: raw.name,
    total,
    tags: toCounts(reviews.tags),
    comments: toStringArray(reviews.comments),
    mapUrl: raw.mapUrl,
  }
}

/**
 * 장소 도구 결과 JSON에서 장소 목록을 꺼낸다. message만 온 응답·깨진 JSON은 조용히 건너뛴다.
 * 후기가 없는 장소의 이름도 함께 돌려주는 이유는 아래 collectPlaceEvidence의 폴백 판정 때문이다.
 */
function fromToolMessage(msg: ToolMessageLike): { names: string[]; evidence: PlaceEvidence[] } {
  const empty = { names: [], evidence: [] }
  if (!msg.name || !PLACE_TOOLS.has(msg.name) || typeof msg.content !== 'string') return empty
  let parsed: unknown
  try {
    parsed = JSON.parse(msg.content)
  } catch {
    return empty
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.places)) return empty
  return {
    names: parsed.places.filter(isRecord).map((p) => p.name).filter((n): n is string => typeof n === 'string'),
    evidence: parsed.places.map(toEvidence).filter((e): e is PlaceEvidence => e !== null),
  }
}

/**
 * streamEvents(v2)의 `on_tool_end` 이벤트가 준 output에서 근거 판정에 쓸 도구 메시지를 만든다.
 *
 * 비스트리밍(runAgent)은 실행이 끝난 뒤 `res.messages`에서 ToolMessage를 그대로 읽지만,
 * 스트리밍에는 그 목록이 없다 — 대신 도구가 끝날 때마다 이 헬퍼로 같은 모양을 쌓아
 * collectPlaceEvidence에 넘긴다. output 모양은 LangGraph 버전에 따라 ToolMessage 객체이거나
 * 문자열일 수 있고, 둘 다 아니면(예: content가 블록 배열) 근거로 쓸 수 없으니 null.
 */
export function toolMessageFromStreamEvent(name: string, output: unknown): ToolMessageLike | null {
  if (typeof output === 'string') return { name, content: output }
  if (isRecord(output) && typeof output.content === 'string') return { name, content: output.content }
  return null
}

/**
 * 도구 결과에서 근거를 모아, 답변 본문에 실제로 이름이 나온 장소만 남긴다.
 *
 * 폴백은 "답변이 후보 중 어느 이름도 부르지 않았을 때"(모델이 이름을 줄여 쓰거나 뭉뚱그린 경우)
 * 에만 돈다. 후기 없는 곳을 추천한 답변에까지 폴백이 끼어들면 추천하지도 않은 장소의 후기를
 * 근거랍시고 보여주게 되므로, 언급 판정에는 후기 없는 장소 이름까지 포함한다.
 */
export function collectPlaceEvidence(messages: ToolMessageLike[], answerText: string): PlaceEvidence[] {
  const byName = new Map<string, PlaceEvidence>()
  const names: string[] = []
  for (const msg of messages) {
    const { names: found, evidence } = fromToolMessage(msg)
    names.push(...found)
    for (const e of evidence) {
      // 같은 장소가 두 도구에서 겹쳐 나오면 먼저 본 쪽(거리·지도 링크가 붙은 검색 결과)을 남긴다.
      if (!byName.has(e.name)) byName.set(e.name, e)
    }
  }

  const all = [...byName.values()]
  const mentions = createMentionTest(answerText)
  if (names.some(mentions)) {
    return all.filter((e) => mentions(e.name))
  }

  return all.sort((a, b) => b.total - a.total).slice(0, FALLBACK_MAX)
}
