import { noticeRepo } from '../../repositories/noticeRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { parseNoticeInput } from '../../utils/notice'

/** 공지 등록(QA #55). 관리자만. */
export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireAdmin(event)
    const input = parseNoticeInput(await readBody(event))
    const notice = noticeRepo.insert(me.id, input)
    setResponseStatus(event, 201)
    return notice
  })
)
