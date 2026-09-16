import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { kakaoLocalService } from '../../services/kakaoLocalService'
import { placeReviewRepo } from '../../repositories/placeReviewRepo'
import { VATECH_OFFICES, findOffice } from '../../../shared/constants/company'
import { toAgentPlaces } from './placeReviewDigest'
import type { PlaceCollector } from '../placeCollector'

const OFFICE_KEYS = VATECH_OFFICES.map((o) => o.key) as [string, ...string[]]
const RADIUS_M = 3000

/**
 * 책 읽기 좋은 장소(카페·도서관·공원) 검색 도구(QA #88). 장소 페이지와 같은 카카오 로컬 검색을
 * 쓰되, 기준점은 사업장(기본: 바텍네트웍스 본사)이고 반경 3km 안에서 가까운 순으로 돌려준다.
 * 키를 클로저로 받고(전역 env 직접 참조 금지), 키가 없으면 실제 호출 없이 안내만 반환한다.
 *
 * 카카오가 돌려주는 장소 id는 사내 장소 후기(place_reviews)의 키와 같으므로, 검색 결과에
 * 동료들이 남긴 태그·코멘트 요약을 한 번의 조회로 붙여준다 — 추천에 근거를 달기 위해서다.
 *
 * collector를 주면 모델에 넘기는 JSON과 별개로 원본 Place(좌표 포함)와 기준 사업장 키를
 * 흘려보낸다. 채팅이 "추천한 곳만 지도에 찍기"에 쓰는 값이다 — 모델 payload에 좌표를 넣어
 * 토큰을 쓰는 대신, 서버가 필요한 것만 따로 챙긴다(placeCollector.ts 참고).
 */
export const makeSearchReadingPlaces = (kakaoRestKey: string, userId: number, collector?: PlaceCollector) =>
  tool(
    async ({ kind, office }) => {
      if (!kakaoRestKey) {
        return JSON.stringify({ message: '장소 검색을 지금은 사용할 수 없어요' })
      }
      const base = findOffice(office)
      try {
        const places = await kakaoLocalService.search(
          kakaoRestKey,
          kind,
          6,
          { lat: base.lat, lng: base.lng },
          RADIUS_M
        )
        const ids = places.map((p) => p.kakaoId).filter((id): id is string => Boolean(id))
        const summaries = placeReviewRepo.summaryByIds(ids, userId)
        collector?.record({ officeKey: base.key, places })
        return JSON.stringify({ office: base.name, places: toAgentPlaces(places, summaries) })
      } catch {
        return JSON.stringify({ message: '장소 검색 중 오류가 발생했어요' })
      }
    },
    {
      name: 'search_reading_places',
      description:
        '회사 사업장 근처에서 책 읽기 좋은 장소(카페·북카페·도서관·공원)를 가까운 순으로 찾는다. ' +
        '"근처 카페 추천해줘", "점심에 책 읽을 데 있어?" 같은 질문에 사용. 결과에는 이름·주소·거리·지도 링크가 있다. ' +
        'reviews 필드가 있는 장소는 사내 동료들이 남긴 후기가 쌓인 곳이다(tags=태그별 인원 수, comments=남긴 사람·부서·한 줄). ' +
        '후기가 있으면 "동료 3명이 조용하다고 했어요"처럼 그 수치를 근거로 들어 우선 추천하고, ' +
        'reviews가 없는 장소에는 후기를 지어내지 말고 거리·종류만 근거로 말하라. ' +
        '답변 뒤에는 /places 이동 버튼을 함께 제안하라.',
      schema: z.object({
        kind: z
          .string()
          .default('카페')
          .describe('찾을 장소 종류 키워드. 예: 카페, 북카페, 도서관, 공원. 사용자가 말한 종류를 그대로 쓰고, 없으면 카페'),
        office: z
          .enum(OFFICE_KEYS)
          .default('networks')
          .describe(
            '기준 사업장 키. 사용자가 사업장·지역을 말하면 반드시 맞춰 고른다. ' +
              'networks=바텍네트웍스 본사(기본. "본사", "네트웍스", "동탄"), ' +
              'msys=바텍엠시스("엠시스", "M시스", "수원", "권선"), ' +
              'emx=바텍이엠엑스("이엠엑스", "EMX", "용인", "이동읍")'
          ),
      }),
    }
  )
