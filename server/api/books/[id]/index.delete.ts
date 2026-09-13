import { bookRepo } from '../../../repositories/bookRepo'
import { loanRepo } from '../../../repositories/loanRepo'
import { handleApi, requireAdmin } from '../../../utils/api'
import { ApiError } from '../../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    const book = bookRepo.findById(id)
    if (!book) throw new ApiError(404, '없는 책이에요')
    if (loanRepo.activeByBook(id)) throw new ApiError(409, '대출 중인 책은 삭제할 수 없어요')

    // 대출 이력(loans 등 FK) 때문에 실삭제가 막히면 bookRepo.remove가 409로 변환해준다.
    bookRepo.remove(id)
    setResponseStatus(event, 204)
    return null
  })
)
