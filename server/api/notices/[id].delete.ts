import { noticeRepo } from '../../repositories/noticeRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'

/** 공지 삭제(QA #55). 관리자만. */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!noticeRepo.findById(id)) throw new ApiError(404, '없는 공지예요')
    noticeRepo.remove(id)
    setResponseStatus(event, 204)
    return null
  })
)
