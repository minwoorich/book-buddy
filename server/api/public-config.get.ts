import { handleApi } from '../utils/api'

/**
 * 클라이언트가 런타임에 필요한 공개 설정. ssr:false SPA는 public runtimeConfig가
 * 빌드 시점에 번들로 구워지는데, Docker 빌드 단계에는 배포 환경변수가 없어 빈 값이
 * 박히는 문제가 있다 — 서버는 런타임 env를 읽을 수 있으므로 이 엔드포인트로 내려준다.
 * (카카오 JS 키는 도메인 제한이 걸린 공개용 키라 노출해도 안전하다.)
 */
export default defineEventHandler(
  handleApi(async (event) => {
    const config = useRuntimeConfig(event)
    return { kakaoJsKey: config.public.kakaoJsKey || '' }
  })
)
