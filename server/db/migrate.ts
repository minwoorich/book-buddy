import type Database from 'better-sqlite3'
import { AI_DEFAULTS, AI_FEATURE_KEYS } from '../ai/defaults'

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      company TEXT NOT NULL, department TEXT NOT NULL, team TEXT NOT NULL,
      position TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('M','F')),
      birth_year INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
      -- 데모용 평문 비밀번호 — 시연 종료와 함께 폐기. 해싱/세션 토큰 없이 x-user-id 신뢰 모델의
      -- 로그인 관문에서만 사용한다.
      password TEXT NOT NULL DEFAULT '1234');
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT, isbn13 TEXT UNIQUE, title TEXT NOT NULL,
      author TEXT NOT NULL, publisher TEXT, category TEXT NOT NULL, description TEXT,
      cover_url TEXT, pub_date TEXT, page_count INTEGER);
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id), user_id INTEGER NOT NULL REFERENCES users(id),
      loaned_at TEXT NOT NULL DEFAULT (datetime('now')), due_at TEXT NOT NULL, returned_at TEXT);
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id), user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','canceled','fulfilled')));
    CREATE TABLE IF NOT EXISTS purchase_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, author TEXT, isbn13 TEXT, cover_url TEXT, reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected')));
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id), user_id INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS review_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id INTEGER NOT NULL REFERENCES reviews(id), user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(review_id, user_id));
    CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id), book_id INTEGER NOT NULL REFERENCES books(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, book_id));
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      -- image_path: 대표(첫 번째) 사진. 실제 전체 사진 목록은 post_images를 사용하고,
      -- post_images가 비어 있을 때(구 데이터 등)의 폴백으로만 이 컬럼을 쓴다.
      book_id INTEGER REFERENCES books(id), image_path TEXT NOT NULL, caption TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS post_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id), image_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id), user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(post_id, user_id));
    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id), user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL CHECK (target_type IN ('book','post','review')), target_id INTEGER NOT NULL,
      reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS qa_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      path TEXT NOT NULL, viewport TEXT, content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'bug', severity TEXT NOT NULL DEFAULT 'minor',
      detail TEXT, image_paths TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    -- 공지사항(QA #55): 관리자만 작성. pinned=1이면 목록 맨 위에 고정.
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, author_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, content TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    -- 장소 후기: 카카오 장소 id를 키로 태그 칩(JSON 코드 배열) + 선택적 한 줄. 1인 1후기(upsert).
    CREATE TABLE IF NOT EXISTS place_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kakao_place_id TEXT NOT NULL, place_name TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      tags TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kakao_place_id, user_id));
    CREATE TABLE IF NOT EXISTS home_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, section_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, feature_key TEXT NOT NULL UNIQUE,
      system_prompt TEXT NOT NULL, model TEXT NOT NULL, max_tokens INTEGER NOT NULL,
      temperature REAL NOT NULL, recursion_limit INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, feature_key TEXT NOT NULL,
      -- user_id는 users(id) FK를 걸지 않는다: seed.ts가 재실행마다 users 테이블을 통째로
      -- 비우는데, ai_usage는 과거 사용 기록 보존을 위해 시드 리셋 대상에서 제외돼 있다.
      -- FK가 있으면 users DELETE 시 제약 위반이 난다. 탈퇴/리셋된 사용자의 기록은 조회부에서
      -- LEFT JOIN으로 처리한다(aiUsageRepo.recent 참고).
      user_id INTEGER NOT NULL, model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `)

  // 기존 DB 호환: users 테이블에 password 컬럼이 없으면(CREATE TABLE IF NOT EXISTS는 이미
  // 존재하는 테이블에 새 컬럼을 추가하지 않는다) ALTER TABLE로 채워 넣는다. 데모용 평문
  // 비밀번호 — 시연 종료와 함께 폐기.
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  const hasPasswordColumn = userColumns.some((c) => c.name === 'password')
  if (!hasPasswordColumn) {
    db.exec(`ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT '1234'`)
    // 방금 컬럼을 추가한 경우에만: 관리자 계정 비번을 데모 기본값으로 반영한다
    // (라이브 DB를 리시드하지 않고도 관리자 로그인이 되게 하기 위함).
    db.prepare(`UPDATE users SET password = 'admin1234' WHERE role = 'admin'`).run()
  }

  // 시연용 게스트 계정(QR 접속 심사위원용): users.is_guest 플래그 + 선점 테이블.
  // 선점은 user_id PK 한 줄 INSERT로 원자적으로 판정되고, token은 x-guest-token 헤더로
  // 다시 제출돼야 인증이 통과한다(전체 해제 → 기존 토큰 무효 → 401 → 클라이언트 자동 로그아웃).
  if (!userColumns.some((c) => c.name === 'is_guest')) {
    db.exec(`ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0`)
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS guest_claims (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      token TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now')));
  `)

  // 기존 DB 호환: qa_feedback의 구조화 필드(유형/심각도/상세/스크린샷)가 없으면 추가한다.
  const qaColumns = db.prepare('PRAGMA table_info(qa_feedback)').all() as { name: string }[]
  const qaColumnNames = new Set(qaColumns.map((c) => c.name))
  if (!qaColumnNames.has('category')) db.exec(`ALTER TABLE qa_feedback ADD COLUMN category TEXT NOT NULL DEFAULT 'bug'`)
  if (!qaColumnNames.has('severity')) db.exec(`ALTER TABLE qa_feedback ADD COLUMN severity TEXT NOT NULL DEFAULT 'minor'`)
  if (!qaColumnNames.has('detail')) db.exec(`ALTER TABLE qa_feedback ADD COLUMN detail TEXT`)
  if (!qaColumnNames.has('image_paths')) db.exec(`ALTER TABLE qa_feedback ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]'`)

  // 홈 화면 기본 섹션 8종 시딩 — 관리자가 노출/순서를 편집한 뒤에도 재시딩 때마다
  // 값을 덮어쓰지 않도록 INSERT OR IGNORE(UNIQUE section_key)로 최초 1회만 채운다.
  const seedSection = db.prepare(
    'INSERT OR IGNORE INTO home_sections (section_key, title, enabled, sort_order) VALUES (?, ?, ?, ?)'
  )
  const defaultSections: [string, string, number, number][] = [
    // admin-picks: 관리자 계정이 찜한 책 = 추천 큐레이션(QA #45). 맨 위(sort_order 0)에 노출.
    ['admin-picks', '임원진 추천 도서', 1, 0],
    ['new', '새로 들어온 책', 1, 1],
    ['top-rated', '동료 평점이 높은 책', 1, 2],
    ['popular', '가장 많이 빌린 책', 1, 3],
    ['available', '지금 바로 빌릴 수 있는 책', 0, 4],
    ['cat-경제경영', '경제경영 서가', 1, 5],
    ['cat-IT · 프로그래밍', 'IT · 프로그래밍 서가', 1, 6],
    ['cat-자기계발', '자기계발 서가', 0, 7],
    ['cat-인문', '인문 서가', 0, 8],
  ]
  for (const [key, title, enabled, sortOrder] of defaultSections) {
    seedSection.run(key, title, enabled, sortOrder)
  }

  // AI 기능(chat/search/places) 기본 설정 3행 — 관리자가 편집한 뒤에도 재시딩 때마다 값을
  // 덮어쓰지 않도록 INSERT OR IGNORE(UNIQUE feature_key)로 최초 1회만 채운다.
  const seedAiSetting = db.prepare(
    `INSERT OR IGNORE INTO ai_settings
       (feature_key, system_prompt, model, max_tokens, temperature, recursion_limit)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  for (const key of AI_FEATURE_KEYS) {
    const d = AI_DEFAULTS[key]
    seedAiSetting.run(key, d.systemPrompt, d.model, d.maxTokens, d.temperature, d.recursionLimit)
  }
}
