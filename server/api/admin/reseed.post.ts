import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { rankingService } from '../../services/rankingService'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'

const execAsync = promisify(exec)
const MODES = ['demo', 'real', 'enrich-reviews', 'enrich-catalog', 'fix-review-misattribution'] as const
type Mode = (typeof MODES)[number]

const SCRIPT_BY_MODE: Record<Mode, string> = {
  demo: 'scripts/demo-seed.ts',
  real: 'scripts/seed.ts',
  'enrich-reviews': 'scripts/enrich-reviews.ts',
  'enrich-catalog': 'scripts/enrich-catalog.ts',
  'fix-review-misattribution': 'scripts/fix-review-misattribution.ts',
}

let running = false

/**
 * 관리자 전용 리시드/보강. mode='demo'는 키 없이 도는 6권 데모 데이터, 'real'은 카카오 책
 * 검색 기반 실데이터(~500권) — 둘 다 기존 데이터를 전부 지우고 다시 채우므로 실행 후 전원
 * 재로그인 필요. 'enrich-reviews'·'enrich-catalog'는 파괴적이지 않은 모드 — 기존 데이터
 * (가입한 실제 계정·게시물 포함)는 그대로 두고 위에 더 쌓기만 한다. 'enrich-reviews'는
 * 직원·리뷰·추천을 더 채우고, 'enrich-catalog'는 새 책을 더 모은 뒤 대출 이력이 없던 책에
 * 최대 18개월 전부터 이어지는 대출-반납 이력을 채운다(카카오 REST 키 필요).
 */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const { mode } = await readBody<{ mode?: string }>(event)
    if (!mode || !MODES.includes(mode as Mode)) {
      throw new ApiError(400, `mode는 ${MODES.join('/')} 중 하나여야 해요`)
    }
    if (running) throw new ApiError(409, '이미 시드가 실행 중이에요')

    const script = SCRIPT_BY_MODE[mode as Mode]
    running = true
    try {
      const { stdout } = await execAsync(`npx tsx ${script}`, {
        cwd: process.cwd(),
        timeout: 5 * 60_000,
        maxBuffer: 2 * 1024 * 1024,
      })
      const lines = stdout.trim().split('\n')
      rankingService.invalidate() // 데이터가 통째로 바뀌었으니 30분 스냅샷을 즉시 버린다
      return { ok: true, mode, summary: lines.slice(-3) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new ApiError(500, `시드 실행 실패: ${msg.slice(0, 300)}`)
    } finally {
      running = false
    }
  })
)
