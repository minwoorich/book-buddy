import { postRepo } from '../../repositories/postRepo'
import { handleApi, optionalUser } from '../../utils/api'

export default defineEventHandler(
  handleApi(async (event) => {
    const me = optionalUser(event)
    return postRepo.listAll(me?.id)
  })
)
