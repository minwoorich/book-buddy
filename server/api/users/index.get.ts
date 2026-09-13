import { userRepo } from '../../repositories/userRepo'
import { handleApi } from '../../utils/api'

// 로그인 화면용 유저 목록. 인증 불필요.
export default defineEventHandler(
  handleApi(async () => {
    return userRepo.findAll()
  })
)
