export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const UPSTREAM_ERROR_MESSAGE = 'AI 서비스 응답에 문제가 있어요. 잠시 후 다시 시도해 주세요.'

/**
 * 핸들러에서 새어 나온 예외를 HTTP 응답용 {statusCode, message}로 바꾼다.
 *
 * - ApiError: 우리가 의도한 코드/메시지 그대로.
 * - 외부 SDK 에러(Anthropic 등, `status`/`statusCode` 필드 보유): h3는 이 필드를 그대로
 *   응답 코드로 쓰기 때문에, 업스트림의 401(키 무효)이 우리 인증 401처럼 보여 클라이언트가
 *   "로그인 만료"로 오인하고 로그아웃시키는 사고가 났다. 502 + 일반 문구로 감싼다.
 * - 그 외: null (호출부가 그대로 던져 500).
 */
export function toHttpError(err: unknown): { statusCode: number; message: string } | null {
  if (err instanceof ApiError) return { statusCode: err.statusCode, message: err.message }
  if (typeof err === 'object' && err !== null) {
    const { status, statusCode } = err as { status?: unknown; statusCode?: unknown }
    if (typeof status === 'number' || typeof statusCode === 'number') {
      return { statusCode: 502, message: UPSTREAM_ERROR_MESSAGE }
    }
  }
  return null
}
