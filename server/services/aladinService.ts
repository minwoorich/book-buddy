// 알라딘 Open API 클라이언트.
//
// 키를 전역에서 읽지 않고 순수 함수의 첫 인자로 받는다 — 이 서비스는 Nuxt 밖(seed 스크립트,
// tsx)과 Nitro 런타임(향후 /api/aladin/search 프록시) 양쪽에서 재사용되므로, 키 조회 방식을
// process.env / useRuntimeConfig 어느 한쪽에 결합시키지 않는다. Nitro 쪽 연결은 후속 태스크에서
// `aladinService.search(useRuntimeConfig().aladinTtbKey, query)` 형태로 호출하면 된다.

const BASE_URL = 'http://www.aladin.co.kr/ttb/api'

export interface AladinItem {
  title: string
  author: string
  publisher: string
  pubDate: string
  description: string
  isbn13: string
  cover: string
  categoryName: string
  pageCount: number | null
}

interface AladinRawItem {
  title?: string
  author?: string
  publisher?: string
  pubDate?: string
  description?: string
  isbn13?: string
  cover?: string
  categoryName?: string
  subInfo?: { itemPage?: number }
}

interface AladinListResponse {
  errorCode?: number
  errorMessage?: string
  item?: AladinRawItem[]
}

const isDebug = () => process.env.SEED_DEBUG === '1'

function toHighResCover(url: string | undefined): string {
  if (!url) return ''
  return url.replace('/cover200/', '/cover500/')
}

function toItem(raw: AladinRawItem): AladinItem {
  return {
    title: raw.title ?? '',
    author: raw.author ?? '',
    publisher: raw.publisher ?? '',
    pubDate: raw.pubDate ?? '',
    description: raw.description ?? '',
    isbn13: raw.isbn13 ?? '',
    cover: toHighResCover(raw.cover),
    categoryName: raw.categoryName ?? '',
    pageCount: raw.subInfo?.itemPage ?? null,
  }
}

async function callAladin(
  ttbKey: string,
  path: string,
  params: Record<string, string | number>
): Promise<AladinListResponse> {
  const url = new URL(`${BASE_URL}/${path}`)
  url.searchParams.set('ttbkey', ttbKey)
  url.searchParams.set('output', 'js')
  url.searchParams.set('Version', '20131101')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`알라딘 API 호출에 실패했어요 (${path}, HTTP ${res.status})`)
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as AladinListResponse
  } catch {
    throw new Error(`알라딘 API 응답을 해석할 수 없어요 (${path}): ${text.slice(0, 200)}`)
  }
}

/** ItemLookUp으로 페이지 수를 조회한다. 실패하거나 isbn13이 없으면 null. */
async function lookupPageCount(ttbKey: string, isbn13: string): Promise<number | null> {
  if (!isbn13) return null
  try {
    const data = await callAladin(ttbKey, 'ItemLookUp.aspx', {
      ItemId: isbn13,
      ItemIdType: 'ISBN13',
      OptResult: 'packing',
    })
    if (isDebug()) {
      // 첫 실행 시 실제 필드명(itemPage 등)을 확인하기 위한 디버그 출력.
      console.log(`[aladinService] ItemLookUp(${isbn13}) raw:`, JSON.stringify(data.item?.[0], null, 2))
    }
    return data.item?.[0]?.subInfo?.itemPage ?? null
  } catch (err) {
    if (isDebug()) console.log(`[aladinService] ItemLookUp(${isbn13}) 실패:`, err)
    return null
  }
}

async function enrichWithPageCount(ttbKey: string, items: AladinItem[]): Promise<AladinItem[]> {
  return Promise.all(
    items.map(async (item) => ({ ...item, pageCount: await lookupPageCount(ttbKey, item.isbn13) }))
  )
}

export const aladinService = {
  /** 분야(categoryId)별 베스트셀러 목록. */
  async bestsellers(ttbKey: string, categoryId: number, count: number): Promise<AladinItem[]> {
    const data = await callAladin(ttbKey, 'ItemList.aspx', {
      QueryType: 'Bestseller',
      SearchTarget: 'Book',
      MaxResults: count,
      CategoryId: categoryId,
      Cover: 'Big',
    })
    if (isDebug()) {
      console.log('[aladinService] bestsellers raw first item:', JSON.stringify(data.item?.[0], null, 2))
    }
    const items = (data.item ?? []).map(toItem)
    return enrichWithPageCount(ttbKey, items)
  },

  /** 제목/저자 키워드 검색 (희망도서 신청, AI 검색 프록시에서 사용). */
  async search(ttbKey: string, query: string): Promise<AladinItem[]> {
    const data = await callAladin(ttbKey, 'ItemSearch.aspx', {
      Query: query,
      QueryType: 'Keyword',
      SearchTarget: 'Book',
      MaxResults: 20,
      Cover: 'Big',
    })
    const items = (data.item ?? []).map(toItem)
    return enrichWithPageCount(ttbKey, items)
  },
}
