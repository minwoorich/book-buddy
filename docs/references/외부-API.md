# 외부 API 정리

## 디자인 캔버스 (Claude Design)

- 화면 디자인 캔버스: https://claude.ai/code/artifact/8a2ec268-8b68-4ffa-8264-e804e300da99
- 작업 파일: `design/*.dc.html` + `design/canvas.json` (수정 시 여기를 고치고 다시 시드/발행)
- 현재 상태: 방향 시안 3종 (A 따뜻한 서점 / B 생산성 툴 / C AI 퍼스트) — 방향 선택 대기

## 네이버 책 검색 API (알라딘 대체 — 2026-09-13 교체, [[../decisions/2026-09-13-알라딘-네이버-교체|결정]])

- 엔드포인트: `GET https://openapi.naver.com/v1/search/book.json?query=&display=`
- 헤더: `X-Naver-Client-Id`, `X-Naver-Client-Secret` (개발자센터 앱에서 "검색" API 사용 설정 — 지역검색과 같은 키)
- 응답 items: `title`(&lt;b&gt; 태그 포함 → 제거 필요), `author`(| 구분), `publisher`, `pubdate`(YYYYMMDD), `isbn`(13자리), `description`, `image`(표지 — `?type=` 쿼리 제거 시 고해상도)
- 페이지 수 미제공 → books.page_count는 null 허용
- 베스트셀러 목록 없음 → 시드는 카테고리별 키워드 검색으로 수집

## ~~알라딘 Open API~~ (서비스 종료로 미사용)

- 키: TTB 키 필요 (`.env`의 `ALADIN_TTB_KEY`), 발급: https://www.aladin.co.kr/ttb/wblog_manage.aspx
- 용도 1 — 시드 수집: `ItemList.aspx` (QueryType=Bestseller, CategoryId로 분야 지정, output=js&Version=20131101)
- 용도 2 — 희망도서 검색: `ItemSearch.aspx` (Query=검색어)
- 주요 응답 필드: `title`, `author`, `publisher`, `categoryName`, `description`, `cover`, `isbn13`, `pubDate`
- 주의: 하루 5,000회 호출 제한. description이 비어 있는 책도 있음 → 시드 시 필터링 고려
- 구현 전에 실제 호출로 응답 형식 확인할 것 (버전 파라미터에 따라 형식 다름)
- 표지 이미지: 검색 결과의 cover URL에서 `/cover200/` → `/cover500/`으로 바꾸면 고해상도. 목업에서 검증된 실표지 6종:
  - 팀장의 탄생 `https://image.aladin.co.kr/product/38579/43/cover500/k582135154_1.jpg`
  - 실리콘밸리의 팀장들 `https://image.aladin.co.kr/product/19389/8/cover500/8935212822_1.jpg`
  - 함께 자라기 `https://image.aladin.co.kr/product/17597/74/cover500/8966262333_1.jpg`
  - 클린 코드 2판 `https://image.aladin.co.kr/product/40175/21/cover500/8966265529_1.jpg`
  - 인스파이어드 `https://image.aladin.co.kr/product/17665/92/cover500/k122534513_2.jpg`
  - 하드씽 `https://image.aladin.co.kr/product/26666/69/cover500/8947547034_1.jpg`
- 참고: Google Books API 무료(키 없는) 호출은 쿼터 0이라 사용 불가 (2026-09-13 확인)

## Claude API + LangChain.js

- 모델: `claude-sonnet-5`, 키: `ANTHROPIC_API_KEY`
- 패키지: `@langchain/anthropic`, `@langchain/core`, `@langchain/langgraph`
- 에이전트: `createReactAgent` (LangGraph prebuilt) + `tool()` 헬퍼로 도구 정의 (zod 스키마)
- 응답을 JSON 형식(`message`/`bookIds`/`actions`)으로 강제 → 서버에서 파싱, 실패 시 텍스트 폴백

## 카카오맵 JS SDK — Web 도메인 등록 (2026-09-15 장애)

- 증상: `/places`에서 실지도 대신 예시 지도, 콘솔 `[KakaoMap] SDK 로드 실패`.
- 원인: `dapi.kakao.com/v2/maps/sdk.js`는 Referer 도메인이 카카오 앱의 Web 플랫폼에 등록돼 있어야 200을 준다. 컨테이너에서 확인한 결과 `https://www.vnlibrary.com`·`https://vnlibrary.com` Referer는 401 `domain mismatched`, `book-buddy-production-27b4.up.railway.app`·`localhost:3000`은 200. 즉 도메인을 vnlibrary.com으로 옮긴 뒤 카카오 콘솔에 새 도메인을 등록하지 않았다.
- 조치: developers.kakao.com → 앱 → 플랫폼 → Web → 사이트 도메인에 `https://www.vnlibrary.com`과 `https://vnlibrary.com` 추가. 코드 변경 불필요(키·public-config는 정상).

## 카카오 로컬 검색 — 리뷰 없음 (2026-09-16 확인)

- `GET https://dapi.kakao.com/v2/local/search/keyword.json` 응답 documents 필드: `id, place_name, category_name, category_group_code, category_group_name, phone, address_name, road_address_name, x, y, place_url, distance`. **평점·리뷰 없음.** 지도 JS SDK에도 리뷰 API 없음.
- `place_url`(`http://place.map.kakao.com/{id}`)이 카카오 리뷰가 있는 상세 페이지 — 아웃링크로만 쓴다. iframe은 현재 프레임 차단 헤더가 없어 뜰 수는 있으나 비공식이라 쓰지 않음.
- `id`는 장소 후기(`place_reviews.kakao_place_id`)의 안정 키로 사용.
