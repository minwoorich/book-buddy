import { guestRepo } from '../../repositories/guestRepo'
import { handleApi } from '../../utils/api'

/** 시연용 게스트 슬롯 목록(선점 여부 포함). 로그인 화면이 비로그인 상태로 부르므로 인증 없음. */
export default defineEventHandler(handleApi(async () => guestRepo.list()))
