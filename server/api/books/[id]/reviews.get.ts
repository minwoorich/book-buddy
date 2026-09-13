import { reviewRepo } from '../../../repositories/reviewRepo'
import { handleApi, optionalUser } from '../../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const bookId = Number(getRouterParam(event, 'id'))
    const me = optionalUser(event)
    return reviewRepo.listByBook(bookId, me?.id)
  })
)
