import { bookRepo } from '../../repositories/bookRepo'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import { BOOK_CATEGORIES } from '../../../shared/types'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const body = await readBody<{
      title?: string
      author?: string
      publisher?: string
      pubDate?: string
      description?: string
      isbn13?: string | null
      cover?: string | null
      category?: string
      pageCount?: number | null
    }>(event)

    const title = body.title?.trim()
    if (!title) throw new ApiError(400, '제목은 필수예요')
    const category = body.category?.trim()
    if (!category || !(BOOK_CATEGORIES as readonly string[]).includes(category)) {
      throw new ApiError(400, '카테고리를 선택해주세요')
    }

    const id = bookRepo.insert({
      isbn13: body.isbn13 || null,
      title,
      author: body.author?.trim() || '',
      publisher: body.publisher || null,
      category,
      description: body.description || null,
      coverUrl: body.cover || null,
      pubDate: body.pubDate || null,
      pageCount: body.pageCount ?? null,
    })

    setResponseStatus(event, 201)
    return bookRepo.findById(id)!
  })
)
