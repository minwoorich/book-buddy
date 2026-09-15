// 합성 직원 데이터 생성기. 전체 리시드(seed.ts)와 추가 시딩(enrich-reviews.ts) 양쪽에서
// 공유한다 — 로그인이 이름 기준이라 이름은 반드시 기존 DB와 겹치지 않아야 한다.

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]
}

const SURNAMES = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권',
  '황', '안', '송', '류', '전', '홍', '문', '손', '배', '백', '허', '유', '남', '심', '노',
  '하', '곽', '성', '차', '주', '우', '구', '민',
]
const GIVEN_A = [
  '민', '서', '지', '은', '다', '상', '유', '태', '소', '준', '현', '우', '예', '재', '성',
  '하', '수', '도', '진', '영', '혜', '경', '원', '아', '승', '규', '채', '나', '시', '윤',
  '정', '호', '건', '율', '솔', '빈', '겸', '완', '린',
]
const GIVEN_B = [
  '우', '연', '훈', '진', '호', '라', '영', '빈', '원', '경', '아', '인', '수', '은', '준',
  '민', '현', '율', '솔', '겸', '희', '안', '람', '혁', '진',
]

function generateName(): string {
  return `${pick(SURNAMES)}${pick(GIVEN_A)}${pick(GIVEN_B)}`
}

/** existingNames와 겹치지 않는 유니크한 이름 count개를 생성한다. */
export function generateUniqueNames(count: number, existingNames: Set<string>): string[] {
  const used = new Set(existingNames)
  const result: string[] = []
  let guard = 0
  while (result.length < count && guard < count * 80) {
    guard++
    const name = generateName()
    if (used.has(name)) continue
    used.add(name)
    result.push(name)
  }
  return result
}

export const COMPANIES = ['바텍', '레이언스', '바텍네트웍스', '바텍이우홀딩스', '바텍엠시스']

const DEPARTMENTS = [
  '개발본부', '연구소', '마케팅본부', '영업본부', '경영지원본부',
  '품질본부', '기획본부', '정보전략실', '인사실', '생산본부',
]
const TEAMS = [
  'SW개발팀', 'HW개발팀', '기구개발팀', '연구1팀', '연구2팀', '마케팅팀', '영업팀',
  'CS팀', '인사팀', '재무팀', '총무팀', '품질팀', '기획팀', '구매팀', '생산팀',
]
const POSITIONS = ['사원', '주임', '대리', '과장', '차장', '부장', '책임', '수석', '팀장', '실장']

export interface OrgProfile {
  company: string
  department: string
  team: string
  position: string
  gender: 'M' | 'F'
  birthYear: number
}

/** 회사·부서·팀·직급·성별·출생연도를 무작위로 채운 소속 정보. */
export function randomOrgProfile(): OrgProfile {
  return {
    company: pick(COMPANIES),
    department: pick(DEPARTMENTS),
    team: pick(TEAMS),
    position: pick(POSITIONS),
    gender: pick<'M' | 'F'>(['M', 'F']),
    birthYear: randomInt(1972, 2002),
  }
}
