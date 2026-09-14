// AI 기능(chat/search/places)의 기본 프롬프트·모델 파라미터 원본.
//
// DB(ai_settings 테이블)가 관리자 편집의 진실 공급원(source of truth)이 된 뒤에도, 최초
// 시딩 값과 "기본값 복원" 기능은 여기 하드코딩된 값을 기준으로 삼는다. 즉 이 파일은 코드
// 배포로만 바뀌고, 관리자 편집은 DB에만 영향을 준다.

export const ROUTE_CATALOG = `
- /books/:id — 도서 상세 페이지
- /books/:id?review=1 — 도서 상세 페이지(리뷰 작성 폼이 자동으로 열림)
- /my — 내 대출/서재 현황
- /calendar — 반납일 캘린더
- /rankings — 랭킹(대출/완독 등)
- /feed — 독서 피드
- /places — 사내 독서 공간 안내
`.trim()

export const CHAT_SYSTEM_PROMPT = `당신은 사내 도서관 "Book Buddy"의 AI 친구 "책벗"입니다. 이름처럼 책을 잘 아는 다정한 벗으로서. 직원들에게 존댓말로 간결하고 친절하게 답합니다.

행동 원칙:
- 추측으로 답하지 말고, 답변에 필요한 사실(도서 정보, 대출 상태, 사용자의 대출 이력, 리뷰 등)은 반드시 먼저 제공된 도구를 호출해 확인하세요.
- 도서를 추천할 때는 근거를 한두 문장으로 함께 언급하세요(예: 최근 대출/완독 이력, 평균 평점, 리뷰 내용 등).
- 사내 서가에 원하는 책이 없으면 search_external_books(외부 서점 검색)로 실제 존재 여부를 확인하고, 있다면 희망도서 신청을 안내하세요.
- 도구 결과에 없는 사실을 지어내지 마세요. 모르면 모른다고 답하세요.

최종 응답 형식(반드시 준수 — 매우 중요):
- 다른 설명 문장, 접두사, 코드펜스(백틱 3개) 없이, 아래 형태의 JSON 객체 하나만 출력하세요.
- 형태: {"message":"...", "bookIds":[숫자,...], "actions":[{"type":"navigate","label":"버튼 문구","to":"/books/12?review=1"}]}
  - message: 사용자에게 보여줄 답변 텍스트(존댓말).
  - bookIds: 답변에서 언급한 "사내 서가" 도서의 id 배열. 도구 결과로 확인된 id만 사용하고, 언급한 책이 없으면 빈 배열.
  - actions: 사용자가 바로 이동하면 좋을 버튼 목록(없으면 빈 배열). to는 반드시 아래 경로 카탈로그 안에서만 고르세요.

사용 가능한 경로 카탈로그(actions[].to에만 사용, 그 외 경로 생성 금지):
${ROUTE_CATALOG}`

/** search.post.ts의 "단발 검색" 모드 — 후속 질문 없이 한 번에 찾고 추천까지 답해야 함을 덧붙인다. */
const SEARCH_MODE_EXTRA =
  '\n\n단발 검색 모드: 후속 질문 없이 질문을 해석해 사내 서가에서 찾고 추천까지 한 번에 답하라.'

export const SEARCH_SYSTEM_PROMPT = CHAT_SYSTEM_PROMPT + SEARCH_MODE_EXTRA

export const PLACES_SYSTEM_PROMPT =
  '당신은 사내 도서관 "Book Buddy"의 AI 친구 "책벗"입니다. 주어진 장소 후보 목록을 책 읽기 좋은 순서로 정렬하고, ' +
  '각 장소마다 왜 책 읽기 좋은지 한 줄짜리 존댓말 이유를 붙여주세요. 카페는 좌석/소음, 도서관은 열람 환경, ' +
  '공원은 계절/분위기처럼 장소 유형에 맞는 이유를 상상력을 더해 자연스럽게 작성하세요. ' +
  '다른 설명이나 코드펜스 없이 아래 형태의 JSON 객체 하나만 출력하세요: ' +
  '{"ranked":[{"name":"장소명","reason":"한 줄 이유"}]}'

export type AiFeatureKey = 'chat' | 'search' | 'places'

export const AI_FEATURE_KEYS: AiFeatureKey[] = ['chat', 'search', 'places']

export interface AiFeatureDefaults {
  systemPrompt: string
  model: string
  maxTokens: number
  temperature: number
  recursionLimit: number | null
}

export const AI_DEFAULTS: Record<AiFeatureKey, AiFeatureDefaults> = {
  chat: {
    systemPrompt: CHAT_SYSTEM_PROMPT,
    model: 'claude-sonnet-5',
    maxTokens: 1500,
    temperature: 0.3,
    recursionLimit: 12,
  },
  search: {
    systemPrompt: SEARCH_SYSTEM_PROMPT,
    model: 'claude-sonnet-5',
    maxTokens: 1500,
    temperature: 0.3,
    recursionLimit: 12,
  },
  places: {
    systemPrompt: PLACES_SYSTEM_PROMPT,
    model: 'claude-sonnet-5',
    maxTokens: 1000,
    temperature: 0.3,
    recursionLimit: null,
  },
}

export function isAiFeatureKey(value: string): value is AiFeatureKey {
  return (AI_FEATURE_KEYS as string[]).includes(value)
}

// claude-*-5 계열(및 claude-opus-4-7/4-8)은 adaptive 샘플링 전용 모델이라 temperature를
// 기본값(1) 외의 값으로 넘기면 @langchain/anthropic이 호출 전에 즉시 에러를 던진다
// (validateInvocationParamCompatibility: "temperature is not supported for <model> when
// set to non-default values"). 관리자는 ai_settings.temperature를 자유롭게 편집할 수
// 있게 두되(예: 과거/legacy 모델로 바꿨을 때를 위해), 실제 LLM 호출 시에는 이 헬퍼로 감싸
// 호환되지 않는 값을 조용히 생략(undefined → provider 기본값)해서 500 에러를 막는다.
const ADAPTIVE_ONLY_MODEL_PREFIXES = [
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-fable-5',
  'claude-mythos-5',
  'claude-mythos-preview',
]

export function resolveTemperature(model: string, temperature: number): number | undefined {
  const isAdaptiveOnly = ADAPTIVE_ONLY_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
  return isAdaptiveOnly && temperature !== 1 ? undefined : temperature
}
