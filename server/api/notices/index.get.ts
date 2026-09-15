import { noticeRepo } from '../../repositories/noticeRepo'
import { handleApi, requireUser } from '../../utils/api'

/** 공지 목록(QA #55). 로그인한 직원 누구나 볼 수 있다. 고정 공지 → 최신순. */
export default defineEventHandler(
  handleApi(async (event) => {
    requireUser(event)
    return noticeRepo.listAll()
  })
)
