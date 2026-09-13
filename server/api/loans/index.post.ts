import { loanService } from '../../services/loanService'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = requireUser(event)
    const { bookId } = await readBody<{ bookId: number }>(event)
    if (!bookId) throw new ApiError(400, '책을 선택해주세요')

    const loan = loanService.borrow(me.id, bookId)
    setResponseStatus(event, 201)
    return loan
  })
)
