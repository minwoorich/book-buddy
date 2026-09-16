/**
 * 스트리밍 중 흘러오는 `tool` 이벤트(도구 이름)를 사용자에게 보여줄 한국어 활동 라벨로 바꾼다.
 * AI 검색 패널과 책벗 채팅이 같은 말을 쓰도록 한곳에 모아 둔다.
 */
const TOOL_LABELS: Record<string, string> = {
  search_books: '서가를 뒤지는 중',
  get_book_detail: '책 정보를 읽는 중',
  get_reviews: '동료 리뷰 확인 중',
  get_my_loans: '대출 이력 살피는 중',
  search_external_books: '외부 서점 검색 중',
  search_reading_places: '근처 장소 찾는 중',
  search_reviewed_places: '동료들의 장소 후기 보는 중',
  borrow_book: '요청 처리 중',
  return_book: '요청 처리 중',
  reserve_book: '요청 처리 중',
  request_purchase: '요청 처리 중',
  add_wishlist: '요청 처리 중',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? '요청 처리 중'
}
