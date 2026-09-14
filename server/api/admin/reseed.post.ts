import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { handleApi, requireAdmin } from '../../utils/api'
import { ApiError } from '../../utils/errors'

const execAsync = promisify(exec)
const MODES = ['demo', 'real'] as const
type Mode = (typeof MODES)[number]

let running = false

/**
 * 관리자 전용 리시드. mode='demo'는 키 없이 도는 6권 데모 데이터,
 * 'real'은 카카오 책 검색 기반 실데이터(~40권). 기존 데이터는 전부 대체된다.
 * 실행 후 사용자 id가 바뀌므로 전원 재로그인 필요.
 */
export default defineEventHandler(
  handleApi(async (event) => {
    requireAdmin(event)
    const { mode } = await readBody<{ mode?: string }>(event)
    if (!mode || !MODES.includes(mode as Mode)) throw new ApiError(400, 'mode는 demo 또는 real이어야 해요')
    if (running) throw new ApiError(409, '이미 시드가 실행 중이에요')

    const script = mode === 'real' ? 'scripts/seed.ts' : 'scripts/demo-seed.ts'
    running = true
    try {
      const { stdout } = await execAsync(`npx tsx ${script}`, {
        cwd: process.cwd(),
        timeout: 5 * 60_000,
        maxBuffer: 2 * 1024 * 1024,
      })
      const lines = stdout.trim().split('\n')
      return { ok: true, mode, summary: lines.slice(-3) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new ApiError(500, `시드 실행 실패: ${msg.slice(0, 300)}`)
    } finally {
      running = false
    }
  })
)
