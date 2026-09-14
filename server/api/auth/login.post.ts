import { userRepo } from '../../repositories/userRepo'
import { handleApi } from '../../utils/api'
import { ApiError } from '../../utils/errors'

/**
 * 로그인 관문. 신뢰 모델 자체는 x-user-id 헤더 그대로 두고, 관문만 이름+비밀번호로 바꾼다.
 * 데모용 평문 비밀번호 비교 — 해싱·세션 토큰 없음, 시연 종료와 함께 폐기.
 * 관문이므로 인증(requireUser) 불필요.
 */
export default defineEventHandler(
  handleApi(async (event) => {
    const { name, password } = await readBody<{ name?: string; password?: string }>(event)
    if (!name?.trim() || !password) {
      throw new ApiError(400, '이름과 비밀번호를 입력해주세요')
    }

    const found = userRepo.findByName(name.trim())
    if (!found || found.password !== password) {
      // 이름 미존재/비밀번호 불일치를 구분하지 않는다.
      throw new ApiError(401, '이름 또는 비밀번호가 맞지 않아요')
    }

    const { password: _password, ...user } = found
    return user
  })
)
