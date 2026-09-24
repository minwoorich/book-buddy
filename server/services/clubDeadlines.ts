import { clubRecruitService } from './clubRecruitService'
import { clubService } from './clubService'
import type { DeadlineRunResult } from '../../shared/types'

/**
 * 기한 작업 전체 — 사람 모임 모집 만료(비동기: 아젠다 생성)와 기존 기한 작업을 한 순서로.
 * clubRecruitService가 clubService를 쓰므로 clubService.runDeadlines 안에서 거꾸로 부르면 순환이라 여기서 묶는다.
 * 모집 만료를 먼저 돌려야 같은 실행 안에서 만들어진 슬롯이 이후 단계(투표 마감 등)에 보인다.
 */
export async function runAllDeadlines(now: Date, deps: { anthropicApiKey: string }): Promise<DeadlineRunResult> {
  const recruitExpired = await clubRecruitService.expireRecruiting(now, deps)
  const rest = clubService.runDeadlines(now)
  // rest.recruitExpired는 항상 0(자리만 채운 값) — 뒤에 둬서 실제 값으로 덮는다.
  return { ...rest, recruitExpired }
}
