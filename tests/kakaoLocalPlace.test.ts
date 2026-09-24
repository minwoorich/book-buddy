import { describe, it, expect, vi, afterEach } from 'vitest'
import { kakaoLocalService } from '../server/services/kakaoLocalService'

const RAW = {
  documents: [
    {
      id: '78911659',
      place_name: '청수당 베이커리',
      category_name: '음식점 > 카페 > 디저트카페',
      road_address_name: '서울 종로구 돈화문로11나길 31-9',
      address_name: '서울 종로구 익선동 144',
      x: '126.98978471926921',
      y: '37.57388138546145',
      place_url: 'http://place.map.kakao.com/78911659',
      distance: '120',
    },
  ],
}

afterEach(() => vi.unstubAllGlobals())

describe('kakaoLocalService.search → Place 매핑', () => {
  it('카카오 id와 place_url을 kakaoId/placeUrl로 채운다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(RAW), { status: 200 })))
    const [place] = await kakaoLocalService.search('key', '카페', 1)
    expect(place).toMatchObject({
      name: '청수당 베이커리',
      category: '디저트카페',
      kakaoId: '78911659',
      placeUrl: 'http://place.map.kakao.com/78911659',
      distanceM: 120,
    })
  })

  it('id가 비어 있으면 kakaoId/placeUrl 키를 만들지 않는다', async () => {
    const noId = { documents: [{ ...RAW.documents[0], id: '', place_url: '' }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(noId), { status: 200 })))
    const [place] = await kakaoLocalService.search('key', '카페', 1)
    expect(place).not.toHaveProperty('kakaoId')
    expect(place).not.toHaveProperty('placeUrl')
  })

  it('distance가 "0"(중간 지점 바로 위)이어도 distanceM: 0을 채운다', async () => {
    const zero = { documents: [{ ...RAW.documents[0], distance: '0' }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(zero), { status: 200 })))
    const [place] = await kakaoLocalService.search('key', '카페', 1)
    expect(place).toHaveProperty('distanceM', 0)
  })
})
