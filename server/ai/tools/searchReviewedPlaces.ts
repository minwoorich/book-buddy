import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { PLACE_TAGS, type PlaceTagCode } from '../../../shared/constants/placeTags'
import { toAgentReviewedPlaces } from './placeReviewDigest'

const TAG_CODES = PLACE_TAGS.map((t) => t.code) as [PlaceTagCode, ...PlaceTagCode[]]
const TAG_GUIDE = PLACE_TAGS.map((t) => `${t.code}=${t.label}`).join(', ')
const LIMIT = 5

/**
 * 사내 후기가 쌓인 장소만 골라 주는 도구. 카카오 검색을 거치지 않고 place_reviews만 보므로
 * 거리 정보는 없지만, "동료들이 조용하다고 한 곳"처럼 후기 자체가 질문인 경우에 답이 된다.
 * 후기 데이터가 아직 얇을 수 있어 결과가 비면 근처 검색 도구로 넘기도록 안내를 돌려준다.
 */
export const makeSearchReviewedPlaces = () =>
  tool(
    async ({ tag }) => {
      const places = placeReviewRepo.topPlaces({ tag, limit: LIMIT })
      if (places.length === 0) {
        return JSON.stringify({
          message: tag
            ? '아직 그 태그로 남은 사내 후기가 없어요. search_reading_places로 사업장 근처 장소를 찾아 추천하세요.'
            : '아직 사내 후기가 쌓인 장소가 없어요. search_reading_places로 사업장 근처 장소를 찾아 추천하세요.',
        })
      }
      return JSON.stringify({ places: toAgentReviewedPlaces(places) })
    },
    {
      name: 'search_reviewed_places',
      description:
        '사내 동료들이 실제로 후기를 남긴 장소를 후기 많은 순으로 찾는다. ' +
        '"동료들이 좋다고 한 카페", "사람들이 조용하다고 한 곳", "다들 어디서 읽어?"처럼 ' +
        '거리보다 동료들의 평가가 중요한 질문에 먼저 사용하라. ' +
        '결과의 tags는 태그별 인원 수, comments는 실제로 남긴 한 줄 후기다 — 그 수치를 그대로 근거로 들어라. ' +
        '거리 정보는 없으니 "가까운 곳"을 물으면 search_reading_places를 쓰고, ' +
        '이 도구가 message만 돌려주면 그 안내대로 search_reading_places로 넘어가라.',
      schema: z.object({
        tag: z
          .enum(TAG_CODES)
          .optional()
          .describe(`특정 조건을 물었을 때만 지정한다. 값: ${TAG_GUIDE}. 조건 없이 "다들 어디 가?"면 비워 둔다`),
      }),
    }
  )
