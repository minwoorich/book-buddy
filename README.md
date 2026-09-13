# 📚 Book Buddy

바텍(VATECH) 사내용 AI 도서관리 시스템 데모입니다. VATECH red를 기조로 한 사내 디자인으로, 도서 검색·대출·리뷰부터 AI 사서 챗봇, 랭킹, 커뮤니티, 책 읽기 좋은 장소 추천까지 하나의 Nuxt 앱에서 제공합니다.

## 기능

- **검색**: 키워드 검색 + AI 검색(자연어 질의를 의도로 해석)
- **AI 사서 챗봇**: 대출/예약/희망도서 신청을 대화로 직접 실행, 관련 화면으로 이동하는 네비게이션 버튼 제공
- **대출/반납/예약**: 재고 기반 대출·반납, 대출 중인 책 예약
- **희망도서 신청**: 서가에 없는 책 신청 → 관리자 승인 플로우
- **리뷰**: 별점 리뷰 작성 + 리뷰 추천(투표)
- **내 서재**: 책쌓기(읽고 싶은 책 담기) · 내 책장(대출/완독 이력)
- **도서 달력**: 대출·반납 일정을 달력으로 확인
- **랭킹**: 반납 기록 기준 개인/팀/부서/계열사 단위 랭킹
- **커뮤니티 피드**: 독서 사진 업로드 + 게시물 공유
- **책 읽기 좋은 장소**: 지도 기반 장소 탐색 + AI 장소 큐레이션
- **관리자**: 대출 현황, 희망도서 신청/신고 처리, 책 등록, 통계 대시보드

## 빠른 시작

### 1. `.env` 작성

프로젝트 루트에 `.env`을 만들고 아래 키를 채웁니다 (`.env.example` 참고).

| 키 | 용도 | 발급처 |
| --- | --- | --- |
| `NUXT_ANTHROPIC_API_KEY` | AI 사서 챗봇 / AI 검색 / 장소 큐레이션 (Claude) | [Anthropic Console](https://console.anthropic.com/) |
| `NUXT_NAVER_SEARCH_CLIENT_ID` / `NUXT_NAVER_SEARCH_CLIENT_SECRET` | 책 검색(시드 포함) + 지역(장소) 검색 | [네이버 개발자센터](https://developers.naver.com/apps/#/register) → 애플리케이션 등록 시 "검색" API 사용 설정 |
| `NUXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 지도 표시 (NCP Maps) | [네이버 클라우드 플랫폼(NCP) 콘솔](https://console.ncloud.com/) → AI·Application Service → Maps |

> ⚠️ 네이버 키는 발급처가 서로 다릅니다. 검색 API(`NUXT_NAVER_SEARCH_*`)는 **네이버 개발자센터**, 지도 API(`NUXT_PUBLIC_NAVER_MAP_CLIENT_ID`)는 **NCP(네이버 클라우드 플랫폼)** 콘솔에서 발급받습니다. 서로 다른 콘솔이니 혼동하지 않도록 주의하세요.

### 2. 설치 및 시드

```bash
npm install
npm run seed   # 네이버 검색 키 필요 (책 데이터 확보용)
npm run dev
```

`http://localhost:3000` 접속 → 로그인 화면에서 이름을 선택합니다. 관리자 화면은 **'도서관리자'**로 로그인하면 볼 수 있습니다.

### 3. 빌드/실행 (Docker 없이)

```bash
npm run build
node .output/server/index.mjs
```

## Docker

> ⚠️ 이미지 빌드는 실제로 실행/검증하지 않았습니다 (Dockerfile 정적 리뷰 수준). 빌드 시 문제가 있을 수 있으니 참고용으로만 사용하세요.

```bash
docker build -t book-buddy .
docker run -p 3000:3000 --env-file .env -v bookbuddy-data:/app/.data book-buddy
```

컨테이너를 처음 띄운 뒤에는 데이터가 비어 있으므로 시드를 실행합니다.

```bash
docker exec -it <container> npx tsx scripts/seed.ts
```

## 키 없이 되는 것 / 안 되는 것

| 기능 | 키 없이 동작? |
| --- | --- |
| 시드(`npm run seed`) | ❌ 네이버 검색 키 필수 |
| AI 사서 챗봇 / AI 검색 / 장소 AI 큐레이션 | ❌ Anthropic 키 필수 |
| 장소(지역) 검색 | ❌ 네이버 검색 키 필수 |
| 지도 표시 | ⚠️ 키 없으면 예시 지도로 폴백 |
| 검색, 대출/반납/예약, 리뷰, 내 서재, 달력, 랭킹, 커뮤니티 피드, 관리자(현황/처리/등록/통계) | ✅ 키 없이 동작 (시드된 데이터 필요) |

## 기술 스택

Nuxt 4(Vue 3) + Nitro 서버 API, better-sqlite3, LangChain/LangGraph 기반 Claude 에이전트로 구성된 풀스택 앱입니다.

- 개발 과정 문서(설계서·의사결정·개발일지)는 `docs/` Obsidian 볼트에 있습니다 (`docs/Home.md`부터 시작).
- 확정 디자인 목업은 `design/mockups/v1a`에 있습니다 (실제 화면 마크업의 원본).

## 테스트

```bash
npm test
```

25개 테스트가 통과해야 합니다.
