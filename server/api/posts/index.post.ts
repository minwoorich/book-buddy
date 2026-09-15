import { bookRepo } from '../../repositories/bookRepo'
import { postImageRepo } from '../../repositories/postImageRepo'
import { postRepo } from '../../repositories/postRepo'
import { postTagRepo } from '../../repositories/postTagRepo'
import { mergeTags, parseTagsField } from '../../../shared/utils/hashtags'
import { uploadService } from '../../services/uploadService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

const MAX_IMAGES = 5

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const parts = await readMultipartFormData(event)
    if (!parts) throw new ApiError(400, '사진이 필요해요')

    const images: { data: Buffer; filename?: string; type?: string }[] = []
    let caption: string | null = null
    let bookIdRaw: string | undefined
    let tagsRaw: string | undefined

    for (const part of parts) {
      if (part.name === 'image' && part.data.length > 0) {
        images.push(part)
      } else if (part.name === 'caption') {
        const text = part.data.toString('utf-8').trim()
        caption = text || null
      } else if (part.name === 'bookId') {
        bookIdRaw = part.data.toString('utf-8').trim()
      } else if (part.name === 'tags') {
        tagsRaw = part.data.toString('utf-8')
      }
    }

    if (images.length === 0) throw new ApiError(400, '사진이 필요해요')
    if (images.length > MAX_IMAGES) throw new ApiError(400, '사진은 최대 5장까지 올릴 수 있어요')

    let bookId: number | null = null
    if (bookIdRaw) {
      const parsed = Number(bookIdRaw)
      if (!Number.isFinite(parsed) || !bookRepo.findById(parsed)) {
        throw new ApiError(404, '없는 책이에요')
      }
      bookId = parsed
    }

    // 데모 범위: 저장 도중 일부가 실패해도 이미 저장된 파일 정리(롤백)는 하지 않는다.
    const savedPaths = images.map((image) => uploadService.save(image))
    const post = postRepo.insert(me.id, savedPaths[0], caption, bookId)
    postImageRepo.insertMany(post.id, savedPaths)
    // 해시태그: 칩으로 고른 것 + 캡션 안의 #태그를 합쳐 저장한다(인스타처럼 둘 다 인정).
    const tags = mergeTags(parseTagsField(tagsRaw), caption)
    postTagRepo.replace(post.id, tags)

    setResponseStatus(event, 201)
    return { ...post, tags, images: savedPaths }
  })
)
