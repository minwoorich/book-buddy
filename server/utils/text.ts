// naverBookService/naverPlaceService 양쪽에서 쓰는 HTML 정리 헬퍼.
// 네이버 검색 API는 검색어 강조를 위해 title 등에 <b> 태그와 HTML 엔티티를 섞어 내려준다.

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/** `<b>`/`</b>` 등 HTML 태그를 제거하고 HTML 엔티티를 디코드한다. */
export function stripHtml(raw: string | undefined): string {
  if (!raw) return ''
  const withoutTags = raw.replace(/<\/?[^>]+>/g, '')
  return withoutTags.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => HTML_ENTITIES[entity] ?? entity)
}
