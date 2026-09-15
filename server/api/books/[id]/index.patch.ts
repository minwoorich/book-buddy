import { bookRepo } from '../../../repositories/bookRepo'
import { handleApi, requireAdmin } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

interface BookPatchBody {
  title?: string
  author?: string
  publisher?: string
  category?: string
  description?: string
  coverUrl?: string
}

/** 도서 메타데이터 수정(관리자) — 외부 API가 잘못/깨진 값을 준 경우 교정한다(QA #13). */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!bookRepo.findById(id)) throw new ApiError(404, '없는 책이에요')

    const body = await readBody<BookPatchBody>(event)
    const fields: BookPatchBody = {}
    for (const key of ['title', 'author', 'publisher', 'category', 'description', 'coverUrl'] as const) {
      const value = body[key]
      if (value === undefined) continue
      if (typeof value !== 'string') throw new ApiError(400, `${key}는 문자열이어야 해요`)
      if ((key === 'title' || key === 'author') && !value.trim()) {
        throw new ApiError(400, `${key === 'title' ? '제목' : '저자'}은(는) 비울 수 없어요`)
      }
      fields[key] = value.trim()
    }
    if (Object.keys(fields).length === 0) throw new ApiError(400, '수정할 내용이 없어요')

    bookRepo.update(id, fields)
    return bookRepo.findById(id)
  })
)
