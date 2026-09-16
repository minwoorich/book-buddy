/**
 * 시연용 게스트 계정 시드 (QR로 접속한 심사위원이 회원가입 없이 바로 쓰는 슬롯).
 *   npx tsx scripts/guest-seed.ts            # 게스트 1~8 생성 (이미 있으면 건너뜀)
 *   npx tsx scripts/guest-seed.ts 12         # 게스트 1~12
 *   npx tsx scripts/guest-seed.ts --remove   # 게스트 계정과 그 활동 기록 삭제 (시연 종료 후)
 * 게스트가 한 명이라도 있으면 /login 상단에 선택 카드가 뜨고, 없으면 기존 화면 그대로다.
 */
import { randomBytes } from 'node:crypto'
import { initDb } from '../server/db/connection'

const db = initDb()
const args = process.argv.slice(2)

if (args.includes('--remove')) {
  const ids = (db.prepare('SELECT id FROM users WHERE is_guest = 1').all() as { id: number }[]).map((r) => r.id)
  if (ids.length === 0) {
    console.log('삭제할 게스트 계정이 없습니다')
    process.exit(0)
  }
  const list = ids.join(',')
  db.exec(`
    DELETE FROM guest_claims WHERE user_id IN (${list});
    DELETE FROM place_reviews WHERE user_id IN (${list});
    DELETE FROM review_votes WHERE user_id IN (${list});
    DELETE FROM reviews WHERE user_id IN (${list});
    DELETE FROM post_comments WHERE user_id IN (${list});
    DELETE FROM post_likes WHERE user_id IN (${list});
    DELETE FROM post_images WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (${list}));
    DELETE FROM post_comments WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (${list}));
    DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE user_id IN (${list}));
    DELETE FROM posts WHERE user_id IN (${list});
    DELETE FROM reports WHERE reporter_id IN (${list});
    DELETE FROM wishlists WHERE user_id IN (${list});
    DELETE FROM purchase_requests WHERE user_id IN (${list});
    DELETE FROM reservations WHERE user_id IN (${list});
    DELETE FROM loans WHERE user_id IN (${list});
    DELETE FROM qa_feedback WHERE user_id IN (${list});
    DELETE FROM users WHERE id IN (${list});
  `)
  console.log(`게스트 ${ids.length}명 삭제 완료`)
  process.exit(0)
}

const count = Number(args[0] ?? 8)
if (!Number.isInteger(count) || count < 1 || count > 20) {
  console.error('게스트 수는 1~20 사이 정수여야 합니다')
  process.exit(1)
}

const exists = db.prepare('SELECT id FROM users WHERE name = ? AND is_guest = 1')
// 비밀번호는 무작위 — 게스트는 이름/비밀번호 폼이 아니라 선택 카드로만 들어온다.
const insert = db.prepare(
  `INSERT INTO users (name, company, department, team, position, gender, birth_year, role, password, is_guest)
   VALUES (?, '바텍', '심사위원', '게스트', '심사위원', 'M', 1990, 'member', ?, 1)`
)
let created = 0
for (let i = 1; i <= count; i++) {
  const name = `게스트 ${i}`
  if (exists.get(name)) continue
  insert.run(name, randomBytes(12).toString('hex'))
  created++
}
console.log(`게스트 계정 ${count}개 확인 — 새로 생성 ${created}명`)
