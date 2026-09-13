import { runAgent } from '../../ai/agent'
import { bookRepo } from '../../repositories/bookRepo'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import type { AiAnswer, Book } from '../../../shared/types'

const SEARCH_SYSTEM_EXTRA =
  '\n\n단발 검색 모드: 후속 질문 없이 질문을 해석해 사내 서가에서 찾고 추천까지 한 번에 답하라.'

export default defineEventHandler(
  handleApi(async (event): Promise<AiAnswer & { books: Book[] }> => {
    const me = requireUser(event)
    const { query } = await readBody<{ query: string }>(event)
    if (!query?.trim()) throw new ApiError(400, '검색어를 입력해주세요')

    const { anthropicApiKey, aladinTtbKey } = useRuntimeConfig(event)
    const answer = await runAgent(
      { anthropicApiKey, aladinTtbKey },
      me.id,
      [{ role: 'user', content: query.trim() }],
      SEARCH_SYSTEM_EXTRA
    )

    const books = answer.bookIds
      .map((id) => bookRepo.findById(id))
      .filter((b): b is Book => Boolean(b))

    return { ...answer, books }
  })
)
