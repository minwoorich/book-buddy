import { bookRepo } from '../../repositories/bookRepo'
import { kakaoBookService } from '../../services/kakaoBookService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { ExternalBookSearchItem } from '../../../shared/types'

export default defineEventHandler(
  handleApi(async (event): Promise<ExternalBookSearchItem[]> => {
    requireUser(event)
    const q = getQuery(event)
    const query = typeof q.query === 'string' ? q.query.trim() : ''
    if (!query) throw new ApiError(400, '검색어를 입력해주세요')

    const { kakaoRestKey } = useRuntimeConfig(event)
    if (!kakaoRestKey) {
      throw new ApiError(503, '책 검색을 사용할 수 없어요')
    }

    const items = await kakaoBookService.search(kakaoRestKey, query)
    // 사내 보유 여부 태깅 — isbn13이 일치하는 책이 있으면 그 책 id로 안내한다.
    return items.map((item) => {
      const owned = item.isbn13 ? bookRepo.findByIsbn13(item.isbn13) : undefined
      return { ...item, inLibrary: Boolean(owned), libraryBookId: owned ? owned.id : null }
    })
  })
)
