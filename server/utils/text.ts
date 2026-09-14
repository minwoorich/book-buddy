// kakaoBookService/kakaoLocalService 양쪽에서 쓰는 HTML 정리 헬퍼.
// 카카오 API 응답에 HTML 태그/엔티티가 섞여 오는 경우를 방어적으로 정리한다.

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
