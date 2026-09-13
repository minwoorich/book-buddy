import { ChatAnthropic } from '@langchain/anthropic'
import { handleApi, requireUser } from '../../utils/api'
import { ApiError } from '../../utils/errors'
import { parsePlaceRanking } from '../../ai/parse'
import { mergeRanking } from '../../services/naverPlaceService'
import type { Place } from '../../../shared/types'

const SYSTEM_PROMPT =
  '당신은 사내 도서관 "Book Buddy"의 AI 사서입니다. 주어진 장소 후보 목록을 책 읽기 좋은 순서로 정렬하고, ' +
  '각 장소마다 왜 책 읽기 좋은지 한 줄짜리 존댓말 이유를 붙여주세요. 카페는 좌석/소음, 도서관은 열람 환경, ' +
  '공원은 계절/분위기처럼 장소 유형에 맞는 이유를 상상력을 더해 자연스럽게 작성하세요. ' +
  '다른 설명이나 코드펜스 없이 아래 형태의 JSON 객체 하나만 출력하세요: ' +
  '{"ranked":[{"name":"장소명","reason":"한 줄 이유"}]}'

export default defineEventHandler(
  handleApi(async (event): Promise<{ ranked: (Place & { reason: string })[] }> => {
    requireUser(event)
    const body = await readBody<{ places?: Place[] }>(event)
    const places = Array.isArray(body?.places) ? body.places : []
    if (places.length === 0) throw new ApiError(400, '장소 목록이 비어 있어요')

    const { anthropicApiKey } = useRuntimeConfig(event)
    if (!anthropicApiKey) throw new ApiError(503, 'AI를 사용할 수 없어요')

    const llm = new ChatAnthropic({
      apiKey: anthropicApiKey,
      model: 'claude-sonnet-5',
      maxTokens: 1000,
    })

    const listText = places
      .map((p, i) => `${i + 1}. ${p.name} (${p.category || '기타'}) - ${p.address}`)
      .join('\n')

    const res = await llm.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `후보 장소 목록:\n${listText}` },
    ])

    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
    const ranked = parsePlaceRanking(content)

    return { ranked: mergeRanking(places, ranked) }
  })
)
