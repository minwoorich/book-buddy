/**
 * 책모임의 모든 임계값. 운영 DB 시뮬레이션 후 조정할 값들이라 한곳에 모아 둔다 —
 * 다른 파일에 숫자를 흩뿌리지 않는다(설계서 §15).
 */
export const CLUB_RULES = {
  /** 이 기간 안에 완독(반납)한 사람만 후보로 본다. */
  completionWindowDays: 60,
  minMembers: 3,
  maxMembers: 5,
  /** 매처 1회 실행당 만들 제안 수 상한. */
  proposalsPerRun: 2,
  /** 모임이 끝난 사람을 다시 초대하기까지 기다리는 기간. */
  personCooldownWeeks: 4,
  /** 같은 책으로 다시 모임을 열기까지 기다리는 기간. */
  bookCooldownMonths: 3,
  /** 초대 응답 기한. */
  inviteDeadlineDays: 3,
  /** 시간 투표 기한(2단계에서 사용). */
  voteDeadlineDays: 2,
  /** 이 기간 안에 모임 이력이 없으면 "미참여"로 보고 가점한다. */
  newcomerWindowDays: 90,
  /** 시간 후보 개수. */
  slotCandidates: 3,
  /** 후보 주(다음 주 월요일)까지 최소 이만큼은 남아 있어야 한다 — 부족하면 그다음 주. */
  minLeadDays: 3,
} as const

/** 모임 점수 가중치. 합은 1. 별점 분산이 최대 가중인 것이 이 설계의 판단이다(설계서 §4.3). */
export const CLUB_SCORE_WEIGHTS = {
  ratingSpread: 0.25,
  concurrency: 0.25,
  reviewDensity: 0.2,
  deptDiversity: 0.15,
  newcomerBonus: 0.15,
} as const

/**
 * describeMatch(승인 화면의 "왜 이 조합인지" 문구)가 어느 문장을 고를지 정하는 문턱값.
 * 매칭 결과에는 영향이 없고 문구 선택에만 쓰인다 — 그래도 임계값은 한곳에 둔다.
 */
export const CLUB_DESCRIBE_THRESHOLDS = {
  /** ratingSpread가 이 값을 넘으면 "별점이 갈려 토론할 거리가 있어요"를 쓴다. */
  notableRatingSpread: 0.2,
  /** newcomerBonus가 이 값 이상이면 "대부분 모임 참여가 처음이에요"를 덧붙인다. */
  mostlyNewcomers: 0.5,
} as const
