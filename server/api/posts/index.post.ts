import { bookRepo } from '../../repositories/bookRepo'
import { postRepo } from '../../repositories/postRepo'
import { uploadService } from '../../services/uploadService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const parts = await readMultipartFormData(event)
    if (!parts) throw new ApiError(400, '사진이 필요해요')

    let image: { data: Buffer; filename?: string; type?: string } | undefined
    let caption: string | null = null
    let bookIdRaw: string | undefined

    for (const part of parts) {
      if (part.name === 'image' && part.data.length > 0) {
        image = part
      } else if (part.name === 'caption') {
        const text = part.data.toString('utf-8').trim()
        caption = text || null
      } else if (part.name === 'bookId') {
        bookIdRaw = part.data.toString('utf-8').trim()
      }
    }

    if (!image) throw new ApiError(400, '사진이 필요해요')

    let bookId: number | null = null
    if (bookIdRaw) {
      const parsed = Number(bookIdRaw)
      if (!Number.isFinite(parsed) || !bookRepo.findById(parsed)) {
        throw new ApiError(404, '없는 책이에요')
      }
      bookId = parsed
    }

    const imagePath = uploadService.save(image)
    const post = postRepo.insert(me.id, imagePath, caption, bookId)
    setResponseStatus(event, 201)
    return post
  })
)
