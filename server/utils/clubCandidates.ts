import { ApiError } from './errors'
import type { ClubVote } from '../../shared/types'

/** 사람 모임 후보 시간 상한(설계서 §3.1). */
export const CANDIDATE_MAX = 5
const HALF_HOUR_MS = 30 * 60 * 1000

/**
 * 개설자가 낸 후보를 검증해 시간순·중복 없는 ISO 배열로. 실패는 400.
 * 30분 단위 검사는 UTC 기준으로 해도 KST(+09:00)와 어긋나지 않는다(정각 오프셋).
 */
export function normalizeSlots(input: unknown, now: Date): string[] {
  if (!Array.isArray(input)) throw new ApiError(400, '후보 시간 형식이 잘못됐어요')
  if (input.length > CANDIDATE_MAX) throw new ApiError(400, `후보 시간은 ${CANDIDATE_MAX}개까지예요`)
  const out = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'string') throw new ApiError(400, '후보 시간 형식이 잘못됐어요')
    const ms = new Date(raw).getTime()
    if (!Number.isFinite(ms)) throw new ApiError(400, '후보 시간 형식이 잘못됐어요')
    if (ms % HALF_HOUR_MS !== 0) throw new ApiError(400, '후보 시간은 30분 단위로 골라주세요')
    if (ms <= now.getTime()) throw new ApiError(400, '지난 시간은 후보로 낼 수 없어요')
    out.add(new Date(ms).toISOString())
  }
  return [...out].sort()
}

/** 후보가 바뀌면 표를 인덱스가 아니라 ISO로 옮긴다. 사라진 후보의 표는 버린다. */
export function remapVotes(oldSlots: string[], newSlots: string[], votes: ClubVote[]): ClubVote[] {
  const newIdx = new Map(newSlots.map((s, i) => [s, i]))
  const out: ClubVote[] = []
  for (const v of votes) {
    const iso = oldSlots[v.slotIdx]
    if (iso === undefined) continue
    const idx = newIdx.get(iso)
    if (idx === undefined) continue
    out.push({ userId: v.userId, slotIdx: idx })
  }
  return out
}

/**
 * 득표 집계 → 최다 득표, 동점·무투표면 가장 이른 후보(입력은 시간순). 이미 지난 후보는 뺀다 —
 * 마감 처리가 며칠 늦게 돌 수도 있으므로 지나버린 시간을 확정으로 내보내면 안 된다. 미래 후보가 없으면 null.
 */
export function pickByVotes(slots: string[], votes: ClubVote[], now: Date): string | null {
  const counts = slots.map((_, i) => votes.filter((v) => v.slotIdx === i).length)
  let best: number | null = null
  for (let i = 0; i < slots.length; i += 1) {
    if (new Date(slots[i]!) <= now) continue
    if (best === null || counts[i]! > counts[best]!) best = i
  }
  return best === null ? null : slots[best]!
}
