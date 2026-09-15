# 2026-09-15 웹 접근성 모드 설계 (큰 글씨·단순 화면 / 색약 모드 / 다크모드)

민우 요청: 노인·시각장애 사용자를 위해 (1) 글자 키우기 + 단순 화면, (2) 색맹·색약 모드, (3) 다크모드를 구현. "권장되는 방법으로" 위임.

## 목표

- 비로그인 게스트를 포함한 모든 사용자가 헤더의 버튼 하나로 4가지 설정을 바꿀 수 있다.
- 설정은 기기에 저장돼 새로고침·재방문 후에도 유지된다.
- 기존 에디토리얼 서재 디자인(ver1a)은 기본 모드에서 그대로 유지된다. 모드는 덧씌우기(overlay)일 뿐 기본 화면을 바꾸지 않는다.

## 설정 모델

```ts
type A11yPrefs = {
  text: 'normal' | 'large' | 'xlarge'   // 글자 크기 100% / 130% / 160%
  simple: boolean                        // 단순 화면
  cvd: boolean                           // 색각 이상(color vision deficiency) 모드
  theme: 'system' | 'light' | 'dark'
}
```

- 저장 키: localStorage `bb:a11y` (JSON). 계정(서버)에는 저장하지 않는다 — 시력·기기 환경은 계정보다 기기에 묶이는 성질이고, 게스트도 써야 한다.
- 복원: `app/plugins/restore-a11y.client.ts`가 앱 시작 시 한 번 읽어 적용 (기존 `restore-current-user.client.ts`와 같은 패턴).
- 정규화: 알 수 없는 값·깨진 JSON은 기본값으로 대체 (`normalizeA11yPrefs()`, 단위 테스트 대상).
- 적용: `<html>` 속성 `data-text`, `data-simple`, `data-cvd`, `data-theme`. `theme: 'system'`이면 `prefers-color-scheme`를 따라 `data-theme`를 light/dark로 해석해 넣고, OS 설정 변경을 `matchMedia` change 이벤트로 추적한다.
- 컴포저블: `useA11y()` — `prefs`(useState), `set(partial)`, `reset()`. DOM 반영 함수 `applyA11yPrefs(prefs)`는 순수 함수로 분리해 플러그인과 컴포저블이 공유.

## UI

- `app/components/common/A11yMenu.vue`: 헤더 오른쪽(사용자 영역 왼쪽)에 "접근성" 아이콘 버튼. 클릭하면 팝오버: 글자 크기(3단 세그먼트), 단순 화면(스위치), 색약 모드(스위치), 테마(3단 세그먼트), "기본값으로" 링크. 바깥 클릭·Esc로 닫힘. `aria-expanded`, `role="dialog"`, 각 컨트롤 `<label>` 연결.
- 배치: `AppHeader`, `AdminHeader`, 그리고 헤더가 없는 `login`·`signup` 페이지의 카드 상단 오른쪽.

## 모드별 CSS (모두 `main.css`에 토큰 기준으로)

### 글자 크기 (`data-text`)
- `html[data-text="large"] { zoom: 1.3 }`, `xlarge`는 1.6. rem 변환(303곳) 대신 zoom을 쓰는 이유: 브라우저 확대와 같이 레이아웃·여백·아이콘이 비례 확대돼 고정폭 요소가 넘치지 않고, 기존 반응형 규칙이 그대로 작동한다. Chrome·Safari·Firefox 126+ 지원.
- `position: fixed` 요소(책벗 FAB·패널, QA 버튼)도 같이 커진다 — 의도된 동작.

### 단순 화면 (`data-simple="true"`)
- 장식 제거: 서가 나무 질감(단색 선반), 표지 그림자·책등 하이라이트, 호버 떠오름 애니메이션, 영문 eyebrow 라벨, 카드 그림자.
- 가독성: 링크 밑줄, 본문 줄간격 1.7, 버튼·입력·칩 최소 높이 44px, 테두리 1px→2px에 `--line-strong` 사용, 포커스 링 3px 명시.
- 색 대비: `--sub`를 더 진하게(#5C5548), 배경은 순백 유지.

### 색약 모드 (`data-cvd="true"`)
- 의미 색 토큰을 오카베-이토 팔레트로 교체: `--ok` #0072B2(파랑), `--ok-tint` #E3F0F9, `--warn` #D55E00→ 텍스트 대비를 위해 #B64F00, `--warn-tint` #FBE9DC, `--gold`(별점) #B8860B, `--info`류 없음.
- 바텍 레드는 유지. 적록 색약에서 문제는 "빨강 vs 초록"인데 초록을 파랑으로 바꾸면 해소된다.
- 색 외 단서: `StatusBadge` "● 대출가능"→"✓ 대출가능", "● 대출중"→"✕ 대출중" (색약 모드일 때만 기호 교체). `.badge.ok/.warn/.no`에 `::before` 기호(✓ / ! / –). 달력·랭킹 막대·관리자 차트의 강조색은 `--accent-data` 토큰을 새로 두고 색약 모드에서 파랑으로.
- 시리즈 팔레트(책쌓기·서가 로더 책등색)는 장식이라 그대로 둔다.

### 다크모드 (`data-theme="dark"`)
- 토큰 덮어쓰기: `--bg` #17140F, `--card` #221D15, `--card-2` #2A241B, `--ink` #F1EBE0, `--sub` #A89F8E, `--line` #3A342B, `--line-strong` #4A4336, `--red` #FF4438(메모리 규칙), `--red-dark` #FF6A60, `--red-tint` #3A1F1E, `--ok-tint`/`--warn-tint` 어두운 계열, 선반색은 약간 어둡게.
- 컴포넌트에 하드코딩된 색 약 60곳을 새 토큰으로 치환:
  - `--text-2` (#3E382D·#464034 본문 보조) / `--hover` (#F4F0E8·#F1EADD 호버 배경) / `--cover-bg` (#EDE7DA 표지 플레이스홀더) / `--star` (#C9A227) / `--star-off` (#E4D9BE·#C9BCA2) / `--muted-2` (#B9AE97·#C4BAA6) / `--bar-track`·`--bar-fill` (랭킹 막대) / `--overlay` (모달 뒤 반투명) / `--shadow-color`(rgba 60,48,28 계열).
  - `#fff` 아이콘 stroke는 레드 배경 위라 유지. 카카오맵(외부 렌더) 제외.
- `color-scheme: dark`로 스크롤바·폼 컨트롤도 어둡게.

## 테스트·검증

- vitest: `tests/a11yPrefs.test.ts` — `normalizeA11yPrefs`(깨진 JSON·알 수 없는 값·부분 객체), `resolveTheme`(system + OS 다크 → dark), `applyA11yPrefs`가 넣는 `data-*` 값 (jsdom 없이 가짜 element로).
- 브라우저: 4모드 조합 주요 화면(홈·책 상세·내 서재·관리자·로그인·챗봇) 눈으로 확인, `npm run build` 통과.

## 버린 대안

- **px→rem 전면 변환**: 303곳 수정 대비 얻는 게 zoom과 같음. zoom이 더 단순하고 되돌리기 쉬움.
- **서버 계정에 설정 저장**: 게스트 미지원, 기기별 차이 반영 불가.
- **색약 모드에서 레드까지 교체**: 브랜드 정체성 훼손. 적록 구분 문제는 초록 쪽 교체로 충분.
- **`prefers-color-scheme`만 따르고 수동 토글 없음**: 발표 데모에서 즉시 시연이 안 됨.
