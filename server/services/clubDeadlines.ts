import { clubRecruitService } from './clubRecruitService'
import { clubService } from './clubService'
import type { DeadlineRunResult } from '../../shared/types'

/**
 * 기한 작업 전체 — 사람 모임 모집 만료(비동기: 아젠다 생성)와 기존 기한 작업을 한 순서로.
 * clubRecruitService가 clubService를 쓰므로 clubService.runDeadlines 안에서 거꾸로 부르면 순환이라 여기서 묶는다.
 * 모집 만료를 먼저 돌려야 같은 실행 안에서 만들어진 슬롯이 이후 단계(투표 마감 등)에 보인다.
 *
 * expireRecruiting은 실패를 격리한다 — croner는 놓친 실행을 따라잡지 않으므로, 모임 하나(또는
 * LLM·DB 이상)가 던진 예외로 이 단계가 통째로 실패하면 그 뒤에 오는 투표 마감·종료·리마인드·
 * 후기 요청까지 그날 전부 멈추게 된다. 한 단계의 실패가 하루 전체를 삼키면 안 된다.
 */
export async function runAllDeadlines(now: Date, deps: { anthropicApiKey: string }): Promise<DeadlineRunResult> {
  let recruitExpired = 0
  try {
    recruitExpired = await clubRecruitService.expireRecruiting(now, deps)
  } catch (e) {
    console.error('[club:deadlines] 모집 만료 실패', e)
  }
  const rest = clubService.runDeadlines(now)
  // rest.recruitExpired는 항상 0(자리만 채운 값) — 뒤에 둬서 실제 값으로 덮는다.
  return { ...rest, recruitExpired }
}
