import { clubRepo } from '../../../repositories/clubRepo'
import { buildIcs } from '../../../utils/ics'
import { slotEndIso } from '../../../utils/clubSlots'
import { handleApi, requireUser, requireIdParam } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

/**
 * 확정된 모임을 iCalendar로 내려준다 — 아웃룩·구글 캘린더에 그대로 들어간다.
 * x-user-id 헤더가 필요하므로 화면은 <a href>가 아니라 fetch → Blob으로 받는다.
 */
export default defineEventHandler(
  handleApi((event) => {
    const me = requireUser(event)
    const id = requireIdParam(event, '모임 번호')
    const club = clubRepo.findById(id)
    if (!club) throw new ApiError(404, '모임을 찾을 수 없어요')
    if (!club.members.some((m) => m.userId === me.id && m.inviteStatus === 'accepted'))
      throw new ApiError(403, '참여를 수락한 사람만 내려받을 수 있어요')
    if (club.status !== 'confirmed' && club.status !== 'done') throw new ApiError(400, '아직 시간이 정해지지 않았어요')
    if (!club.meetAt) throw new ApiError(400, '아직 시간이 정해지지 않았어요')

    const questions = club.agenda.map((a, i) => `${i + 1}. ${a.question}`).join('\n')
    const names = club.members.filter((m) => m.inviteStatus === 'accepted').map((m) => m.userName).join(', ')
    const ics = buildIcs({
      uid: `club-${club.id}@vnlibrary.com`,
      startIso: club.meetAt,
      endIso: slotEndIso(club.meetAt),
      summary: `『${club.bookTitle}』 책모임`,
      description: `참가자: ${names}\n\n토론 질문\n${questions}`,
      location: club.place?.name ?? null,
      stampIso: new Date().toISOString(),
    })
    setResponseHeader(event, 'content-type', 'text/calendar; charset=utf-8')
    setResponseHeader(event, 'content-disposition', `attachment; filename="club-${club.id}.ics"`)
    return ics
  })
)
