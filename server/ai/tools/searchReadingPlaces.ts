import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { kakaoLocalService } from '../../services/kakaoLocalService'
import { VATECH_OFFICES, findOffice } from '../../../shared/constants/company'

const OFFICE_KEYS = VATECH_OFFICES.map((o) => o.key) as [string, ...string[]]
const RADIUS_M = 3000

/**
 * 책 읽기 좋은 장소(카페·도서관·공원) 검색 도구(QA #88). 장소 페이지와 같은 카카오 로컬 검색을
 * 쓰되, 기준점은 사업장(기본: 바텍네트웍스 본사)이고 반경 3km 안에서 가까운 순으로 돌려준다.
 * 키를 클로저로 받고(전역 env 직접 참조 금지), 키가 없으면 실제 호출 없이 안내만 반환한다.
 */
export const makeSearchReadingPlaces = (kakaoRestKey: string) =>
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
        return JSON.stringify({
          office: base.name,
          places: places.map((p) => ({
            name: p.name,
            category: p.category,
            address: p.address,
            distanceM: p.distanceM ?? null,
            mapUrl: `https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat},${p.lng}`,
          })),
        })
      } catch {
        return JSON.stringify({ message: '장소 검색 중 오류가 발생했어요' })
      }
    },
    {
      name: 'search_reading_places',
      description:
        '회사 사업장 근처에서 책 읽기 좋은 장소(카페·북카페·도서관·공원)를 가까운 순으로 찾는다. ' +
        '"근처 카페 추천해줘", "점심에 책 읽을 데 있어?" 같은 질문에 사용. 결과에는 이름·주소·거리·지도 링크가 있다. ' +
        '답변 뒤에는 /places 이동 버튼을 함께 제안하라.',
      schema: z.object({
        kind: z
          .string()
          .default('카페')
          .describe('찾을 장소 종류 키워드. 예: 카페, 북카페, 도서관, 공원. 사용자가 말한 종류를 그대로 쓰고, 없으면 카페'),
        office: z
          .enum(OFFICE_KEYS)
          .default('networks')
          .describe('기준 사업장 키. networks=바텍네트웍스 본사(동탄, 기본), msys=바텍엠시스(수원), emx=바텍이엠엑스(용인)'),
      }),
    }
  )
