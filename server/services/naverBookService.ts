// 네이버 책 검색 API 클라이언트.
//
// 키를 전역에서 읽지 않고 순수 함수의 첫 인자로 받는다 — 이 서비스는 Nuxt 밖(seed 스크립트,
// tsx)과 Nitro 런타임(/api/book-search 프록시, AI 도구) 양쪽에서 재사용되므로, 키 조회 방식을
// process.env / useRuntimeConfig 어느 한쪽에 결합시키지 않는다.

import type { ExternalBookItem } from '../../shared/types'

const BASE_URL = 'https://openapi.naver.com/v1/search/book.json'

interface NaverBookRawItem {
  title?: string
  link?: string
  image?: string
  author?: string
  discount?: string
  publisher?: string
  pubdate?: string
  isbn?: string
  description?: string
}

interface NaverBookResponse {
  errorCode?: string
  errorMessage?: string
  items?: NaverBookRawItem[]
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/** `<b>`/`</b>` 등 HTML 태그를 제거하고 HTML 엔티티를 디코드한다. */
function cleanText(raw: string | undefined): string {
  if (!raw) return ''
  const withoutTags = raw.replace(/<\/?[^>]+>/g, '')
  return withoutTags.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => HTML_ENTITIES[entity] ?? entity)
}

/** `저자1|저자2` 형태를 `저자1, 저자2`로 합친다. */
function joinAuthors(raw: string | undefined): string {
  if (!raw) return ''
  return raw
    .split('|')
    .map((a) => a.trim())
    .filter(Boolean)
    .join(', ')
}

/** `YYYYMMDD` → `YYYY-MM-DD`. 8자리가 아니면 원문 그대로. */
function formatPubDate(raw: string | undefined): string {
  if (!raw) return ''
  if (!/^\d{8}$/.test(raw)) return raw
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/** 공백으로 구분된 isbn 값들 중 13자리 숫자를 찾는다. 없으면 null. */
function pickIsbn13(raw: string | undefined): string | null {
  if (!raw) return null
  const candidate = raw.split(/\s+/).find((v) => /^\d{13}$/.test(v))
  return candidate ?? null
}

/** `?` 이후 쿼리스트링을 제거해 고해상도 이미지 URL로 만든다. 빈 값이면 null. */
function toCover(raw: string | undefined): string | null {
  if (!raw) return null
  const index = raw.indexOf('?')
  const url = index === -1 ? raw : raw.slice(0, index)
  return url || null
}

function toItem(raw: NaverBookRawItem): ExternalBookItem {
  return {
    title: cleanText(raw.title),
    author: joinAuthors(raw.author),
    publisher: raw.publisher ?? '',
    pubDate: formatPubDate(raw.pubdate),
    description: cleanText(raw.description),
    isbn13: pickIsbn13(raw.isbn),
    cover: toCover(raw.image),
    pageCount: null,
  }
}

export const naverBookService = {
  /** 제목/저자 키워드 검색 (희망도서 신청, AI 검색 도구, 시드 스크립트에서 사용). */
  async search(
    clientId: string,
    clientSecret: string,
    query: string,
    display = 10
  ): Promise<ExternalBookItem[]> {
    const url = new URL(BASE_URL)
    url.searchParams.set('query', query)
    url.searchParams.set('display', String(display))

    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    })

    const text = await res.text()
    let data: NaverBookResponse
    try {
      data = JSON.parse(text) as NaverBookResponse
    } catch {
      throw new Error(`네이버 책 검색 API 응답을 해석할 수 없어요: ${text.slice(0, 200)}`)
    }

    if (!res.ok || data.errorCode) {
      const detail = [data.errorCode, data.errorMessage].filter(Boolean).join(': ')
      throw new Error(`네이버 책 검색 API 오류 (HTTP ${res.status})${detail ? ` ${detail}` : ''}`)
    }

    return (data.items ?? []).map(toItem)
  },
}
