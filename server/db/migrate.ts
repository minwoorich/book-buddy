import type Database from 'better-sqlite3'

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      company TEXT NOT NULL, department TEXT NOT NULL, team TEXT NOT NULL,
      position TEXT NOT NULL, gender TEXT NOT NULL CHECK (gender IN ('M','F')),
      birth_year INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')));
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
      book_id INTEGER REFERENCES books(id), image_path TEXT NOT NULL, caption TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
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
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS home_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, section_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL);
  `)

  // 홈 화면 기본 섹션 8종 시딩 — 관리자가 노출/순서를 편집한 뒤에도 재시딩 때마다
  // 값을 덮어쓰지 않도록 INSERT OR IGNORE(UNIQUE section_key)로 최초 1회만 채운다.
  const seedSection = db.prepare(
    'INSERT OR IGNORE INTO home_sections (section_key, title, enabled, sort_order) VALUES (?, ?, ?, ?)'
  )
  const defaultSections: [string, string, number, number][] = [
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
}
