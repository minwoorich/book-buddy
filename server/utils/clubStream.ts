import type { ClubMessage } from '../../shared/types'

type Send = (m: ClubMessage) => void
interface Sub { userId: number; send: Send }

/**
 * 모임 채팅 팬아웃 — 프로세스 안의 구독자 목록. SSE 핸들러가 붙고(subscribe) 서비스가 민다(publish).
 * Railway 단일 컨테이너 전제; 인스턴스가 늘면 브로커(Redis 등)로 바꿔야 한다.
 */
const subs = new Map<number, Set<Sub>>()

export const clubStream = {
  subscribe(clubId: number, userId: number, send: Send): () => void {
    const sub: Sub = { userId, send }
    const set = subs.get(clubId) ?? new Set<Sub>()
    set.add(sub)
    subs.set(clubId, set)
    return () => {
      set.delete(sub)
      if (set.size === 0) subs.delete(clubId)
    }
  },

  /** 한 구독자의 send가 던져도 나머지는 받는다(끊긴 연결이 다른 사람 메시지를 막으면 안 된다). */
  publish(clubId: number, message: ClubMessage): void {
    for (const sub of subs.get(clubId) ?? []) {
      try { sub.send(message) } catch { /* 끊긴 구독자 — onClosed가 곧 지운다 */ }
    }
  },

  onlineUserIds(clubId: number): Set<number> {
    return new Set([...(subs.get(clubId) ?? [])].map((s) => s.userId))
  },

  reset(): void { subs.clear() },
}
