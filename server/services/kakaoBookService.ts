// 카카오 책 검색 API 클라이언트.
//
// 키를 전역에서 읽지 않고 순수 함수의 첫 인자로 받는다 — 이 서비스는 Nuxt 밖(seed 스크립트,
// tsx)과 Nitro 런타임(/api/book-search 프록시, AI 도구) 양쪽에서 재사용되므로, 키 조회 방식을
// process.env / useRuntimeConfig 어느 한쪽에 결합시키지 않는다.

import type { ExternalBookItem } from '../../shared/types'
import { stripHtml as cleanText } from '../utils/text'

const BASE_URL = 'https://dapi.kakao.com/v3/search/book'

interface KakaoBookRawItem {
  title?: string
  contents?: string
  isbn?: string
  datetime?: string
  authors?: string[]
  publisher?: string
  thumbnail?: string
}

interface KakaoBookResponse {
  documents?: KakaoBookRawItem[]
}

interface KakaoErrorResponse {
  errorType?: string
  message?: string
}

/** `datetime`(ISO 8601)의 앞 10자(YYYY-MM-DD)만 취한다. 없거나 형식이 짧으면 null. */
function formatPubDate(raw: string | undefined): string | null {
  if (!raw || raw.length < 10) return null
  return raw.slice(0, 10)
}

/** 공백으로 구분된 isbn 값들 중 13자리 숫자를 찾는다. 없으면 null. */
function pickIsbn13(raw: string | undefined): string | null {
  if (!raw) return null
  const candidate = raw.split(/\s+/).find((v) => /^\d{13}$/.test(v))
  return candidate ?? null
}

/**
 * 카카오 책 검색의 thumbnail은 저해상도 프록시 URL이다
 * (`https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=<url인코딩된 원본>`).
 * `fname` 쿼리 파라미터를 디코딩해 원본 고화질 표지 URL을 꺼낸다. 추출에 실패하거나
 * fname이 없으면 thumbnail 원값을 그대로 쓴다. thumbnail 자체가 비어있으면 null.
 */
export function extractOriginalCover(thumbnail: string): string | null {
  if (!thumbnail) return null
  const match = thumbnail.match(/[?&]fname=([^&]+)/)
  if (!match) return thumbnail
  try {
    const original = decodeURIComponent(match[1])
    if (!original) return thumbnail
    return original.startsWith('http:') ? `https:${original.slice('http:'.length)}` : original
  } catch {
    return thumbnail
  }
}

function toItem(raw: KakaoBookRawItem): ExternalBookItem {
  return {
    title: cleanText(raw.title),
    author: (raw.authors ?? []).join(', '),
    publisher: raw.publisher ?? '',
    pubDate: formatPubDate(raw.datetime) ?? '',
    description: cleanText(raw.contents),
    isbn13: pickIsbn13(raw.isbn),
    cover: extractOriginalCover(raw.thumbnail ?? ''),
    pageCount: null,
  }
}

export const kakaoBookService = {
  /** 제목/저자 키워드 검색 (희망도서 신청, AI 검색 도구, 시드 스크립트에서 사용). */
  async search(restKey: string, query: string, display = 10): Promise<ExternalBookItem[]> {
    const url = new URL(BASE_URL)
    url.searchParams.set('query', query)
    url.searchParams.set('size', String(display))

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `KakaoAK ${restKey}`,
      },
    })

    const text = await res.text()

    if (!res.ok) {
      let detail = ''
      try {
        const errData = JSON.parse(text) as KakaoErrorResponse
        detail = [errData.errorType, errData.message].filter(Boolean).join(': ')
      } catch {
        detail = text.slice(0, 200)
      }
      const keyHint = res.status === 401 || res.status === 403 ? ' (REST API 키가 올바른지 확인해주세요)' : ''
      throw new Error(`카카오 책 검색 API 오류 (HTTP ${res.status})${detail ? ` ${detail}` : ''}${keyHint}`)
    }

    let data: KakaoBookResponse
    try {
      data = JSON.parse(text) as KakaoBookResponse
    } catch {
      throw new Error(`카카오 책 검색 API 응답을 해석할 수 없어요: ${text.slice(0, 200)}`)
    }

    return (data.documents ?? []).map(toItem)
  },
}
