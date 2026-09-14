import { userRepo } from '../../repositories/userRepo'
import { handleApi } from '../../utils/api'
import { ApiError } from '../../utils/errors'

interface SignupBody {
  name?: string
  password?: string
  company?: string
  department?: string
  team?: string
  position?: string
  gender?: 'M' | 'F'
  birthYear?: number
}

/**
 * 회원가입 관문. 로그인과 마찬가지로 신뢰 모델은 x-user-id 헤더 그대로 두고,
 * 여기서는 users 행을 하나 만들어 role을 'member'로 고정한다.
 * 데모용 평문 비밀번호 — 해싱 없음, 시연 종료와 함께 폐기.
 */
export default defineEventHandler(
  handleApi(async (event) => {
    const body = await readBody<SignupBody>(event)
    const name = body.name?.trim()
    const { password, company, department, team, position, gender, birthYear } = body

    if (
      !name ||
      !password ||
      !company ||
      !department ||
      !team ||
      !position ||
      (gender !== 'M' && gender !== 'F') ||
      birthYear == null
    ) {
      throw new ApiError(400, '모든 항목을 입력해주세요')
    }

    if (userRepo.findByName(name)) {
      throw new ApiError(409, '이미 사용 중인 이름이에요')
    }

    if (!Number.isInteger(birthYear) || birthYear < 1940 || birthYear > 2010) {
      throw new ApiError(400, '출생연도를 다시 확인해주세요')
    }

    if (password.length < 4) {
      throw new ApiError(400, '비밀번호는 4자 이상이어야 해요')
    }

    const user = userRepo.insert({ name, password, company, department, team, position, gender, birthYear })
    setResponseStatus(event, 201)
    return user
  })
)
