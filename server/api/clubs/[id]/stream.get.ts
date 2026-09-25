import { clubRepo } from '../../../repositories/clubRepo'
import { guestRepo } from '../../../repositories/guestRepo'
import { clubStream } from '../../../utils/clubStream'
import { handleApi, parseQueryUserId, requireIdParam } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

const PING_MS = 25_000

/**
 * 모임 채팅 SSE. EventSource는 헤더를 못 붙이므로 인증은 쿼리(userId·guestToken)로 —
 * guestRepo.resolveUser가 x-user-id 헤더와 같은 규칙으로 판정한다. 참가자(수락)만.
 * 이벤트: message(ClubMessage JSON), ping(25초 — 프록시 유휴 타임아웃 방지).
 */
export default defineEventHandler(
  handleApi((event) => {
    const q = getQuery(event)
    const userId = parseQueryUserId(q.userId)
    const user = userId ? guestRepo.resolveUser(userId, typeof q.guestToken === 'string' ? q.guestToken : undefined) : undefined
    if (!user) throw new ApiError(401, '로그인이 필요해요')
    const id = requireIdParam(event, '모임 번호')
    const club = clubRepo.findById(id)
    if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')
    const me = club.members.find((m) => m.userId === user.id)
    if (!me || me.inviteStatus !== 'accepted') throw new ApiError(403, '참여하면 이야기를 볼 수 있어요')

    const stream = createEventStream(event)
    // Node는 첫 write 전까지 응답 헤더를 버퍼에 쥐고 있는다 — 연결 직후 ping을 한 번 밀어
    // 헤더(따라서 EventSource의 'open')가 즉시 나가게 한다. 안 그러면 다음 정기 ping(25초)까지
    // 클라이언트가 "연결 중" 상태로 멈춰 있는다.
    void stream.push({ event: 'ping', data: '' })
    const unsubscribe = clubStream.subscribe(id, user.id, (m) => { void stream.push({ event: 'message', data: JSON.stringify(m) }) })
    const ping = setInterval(() => { void stream.push({ event: 'ping', data: '' }) }, PING_MS)
    stream.onClosed(async () => {
      clearInterval(ping)
      unsubscribe()
      await stream.close()
    })
    return stream.send()
  })
)
