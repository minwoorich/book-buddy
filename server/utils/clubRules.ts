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
} as const

/** 모임 점수 가중치. 합은 1. 별점 분산이 최대 가중인 것이 이 설계의 판단이다(설계서 §4.3). */
export const CLUB_SCORE_WEIGHTS = {
  ratingSpread: 0.25,
  concurrency: 0.25,
  reviewDensity: 0.2,
  deptDiversity: 0.15,
  newcomerBonus: 0.15,
} as const
