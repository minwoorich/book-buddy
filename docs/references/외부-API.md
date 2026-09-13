# 외부 API 정리

## 디자인 캔버스 (Claude Design)

- 화면 디자인 캔버스: https://claude.ai/code/artifact/8a2ec268-8b68-4ffa-8264-e804e300da99
- 작업 파일: `design/*.dc.html` + `design/canvas.json` (수정 시 여기를 고치고 다시 시드/발행)
- 현재 상태: 방향 시안 3종 (A 따뜻한 서점 / B 생산성 툴 / C AI 퍼스트) — 방향 선택 대기

## 알라딘 Open API

- 키: TTB 키 필요 (`.env`의 `ALADIN_TTB_KEY`), 발급: https://www.aladin.co.kr/ttb/wblog_manage.aspx
- 용도 1 — 시드 수집: `ItemList.aspx` (QueryType=Bestseller, CategoryId로 분야 지정, output=js&Version=20131101)
- 용도 2 — 희망도서 검색: `ItemSearch.aspx` (Query=검색어)
- 주요 응답 필드: `title`, `author`, `publisher`, `categoryName`, `description`, `cover`, `isbn13`, `pubDate`
- 주의: 하루 5,000회 호출 제한. description이 비어 있는 책도 있음 → 시드 시 필터링 고려
- 구현 전에 실제 호출로 응답 형식 확인할 것 (버전 파라미터에 따라 형식 다름)

## Claude API + LangChain.js

- 모델: `claude-sonnet-5`, 키: `ANTHROPIC_API_KEY`
- 패키지: `@langchain/anthropic`, `@langchain/core`, `@langchain/langgraph`
- 에이전트: `createReactAgent` (LangGraph prebuilt) + `tool()` 헬퍼로 도구 정의 (zod 스키마)
- 응답을 JSON 형식(`message`/`bookIds`/`actions`)으로 강제 → 서버에서 파싱, 실패 시 텍스트 폴백
