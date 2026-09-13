import { aladinService } from '../../services/aladinService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    requireUser(event)
    const q = getQuery(event)
    const query = typeof q.query === 'string' ? q.query.trim() : ''
    if (!query) throw new ApiError(400, '검색어를 입력해주세요')

    const { aladinTtbKey } = useRuntimeConfig(event)
    if (!aladinTtbKey) throw new ApiError(503, '알라딘 검색을 사용할 수 없어요')

    return aladinService.search(aladinTtbKey, query)
  })
)
