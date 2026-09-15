import { ApiError } from './errors'
import type { NoticeInput } from '../repositories/noticeRepo'

const TITLE_MAX = 100
const CONTENT_MAX = 5000

/** 공지 작성·수정 본문 검증(QA #55). 제목·내용은 필수, 길이 상한을 둔다. */
export function parseNoticeInput(body: unknown): NoticeInput {
  const b = (body ?? {}) as { title?: unknown; content?: unknown; pinned?: unknown }
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const content = typeof b.content === 'string' ? b.content.trim() : ''
  if (!title) throw new ApiError(400, '제목을 입력해주세요')
  if (title.length > TITLE_MAX) throw new ApiError(400, `제목은 ${TITLE_MAX}자 이내로 적어주세요`)
  if (!content) throw new ApiError(400, '내용을 입력해주세요')
  if (content.length > CONTENT_MAX) throw new ApiError(400, `내용은 ${CONTENT_MAX}자 이내로 적어주세요`)
  return { title, content, pinned: b.pinned === true || b.pinned === 1 || b.pinned === '1' }
}
