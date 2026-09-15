import { handleApi, requireUser } from '../../utils/api'

/** 게스트 세션 생존 확인. 전체 해제로 토큰이 무효해지면 401 → 클라이언트가 자동 로그아웃한다. */
export default defineEventHandler(handleApi(async (event) => ({ id: requireUser(event).id })))
