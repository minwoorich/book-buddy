/**
 * 외부 API 키 없이 동작하는 데모 시드 (검증된 실표지 6권 + 직원 12명 + 활동 데이터).
 * 실행: npm run seed:demo
 * 목업에서 검증된 실제 표지 6권 + 직원 12명 + 활동 데이터.
 */
import { initDb } from '../server/db/connection'

const db = initDb()

// --if-empty: 이미 데이터가 있으면 아무것도 하지 않는다 (배포 부팅 시 자동 시드용)
if (process.argv.includes('--if-empty')) {
  const existing = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
  if (existing > 0) {
    console.log(`데모 시드 건너뜀: 이미 users ${existing}명 존재 (--if-empty)`)
    process.exit(0)
  }
}

const TABLES = [
  'review_votes', 'reviews', 'post_comments', 'post_likes', 'posts',
  'reports', 'wishlists', 'purchase_requests', 'reservations', 'loans', 'books', 'users',
]
for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run()

const insUser = db.prepare(
  `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
)
const users: [string, string, string, string, string, 'M' | 'F', number, string][] = [
  ['김민우', '바텍', '개발본부', 'SW개발팀', '사원', 'M', 1996, 'member'],
  ['이서연', '바텍', '마케팅본부', '마케팅팀', '대리', 'F', 1993, 'member'],
  ['박지훈', '레이언스', '연구소', '연구1팀', '책임', 'M', 1987, 'member'],
  ['최은지', '바텍', '경영지원본부', '인사팀', '과장', 'F', 1989, 'member'],
  ['정다은', '바텍네트웍스', '영업본부', '영업팀', '사원', 'F', 1998, 'member'],
  ['한상우', '바텍', '개발본부', 'SW개발팀', '팀장', 'M', 1983, 'member'],
  ['오유진', '레이언스', '품질본부', '품질팀', '대리', 'F', 1992, 'member'],
  ['강태호', '바텍', '경영지원본부', '재무팀', '차장', 'M', 1980, 'member'],
  ['윤소라', '바텍네트웍스', '영업본부', 'CS팀', '사원', 'F', 1997, 'member'],
  ['임준영', '바텍', '연구소', '연구2팀', '수석', 'M', 1978, 'member'],
  ['서지민', '레이언스', '기획본부', '기획팀', '대리', 'F', 1994, 'member'],
  ['도서관리자', '바텍', '경영지원본부', '총무팀', '사서', 'F', 1985, 'admin'],
]
const uid: Record<string, number> = {}
for (const u of users) uid[u[0]] = Number(insUser.run(...u).lastInsertRowid)

const insBook = db.prepare(
  `INSERT INTO books (isbn13, title, author, publisher, category, description, cover_url, pub_date, page_count)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)
const COVER = (p: string) => `https://image.aladin.co.kr/product/${p}.jpg`
const books: [string | null, string, string, string, string, string, string, string, number | null][] = [
  ['9791165210748', '팀장의 탄생', '줄리 주오', '더퀘스트', '경제경영',
    '페이스북 첫 인턴 디자이너에서 부사장이 되기까지, 얼떨결에 팀장이 된 사람의 모든 시행착오를 담은 실리콘밸리식 팀장 수업. 1:1 미팅, 피드백, 채용, 회의까지 초보 팀장이 부딪히는 상황을 그대로 다룬다.',
    COVER('38579/43/cover500/k582135154_1'), '2020-05-13', 344],
  [null, '실리콘밸리의 팀장들', '킴 스콧', '청림출판', '경제경영',
    '구글과 애플에서 검증된 "완전한 솔직함(Radical Candor)" — 까칠한 인재마저 사로잡는 지독한 솔직함으로 사람을 얻는 소통 전략.',
    COVER('19389/8/cover500/8935212822_1'), '2019-06-24', 448],
  [null, '함께 자라기', '김창준', '인사이트', '자기계발',
    '애자일로 가는 길. 개인의 학습과 팀의 협력이 어떻게 함께 자라는 조직을 만드는지, 연구와 현장 경험으로 풀어낸 책.',
    COVER('17597/74/cover500/8966262333_1'), '2018-11-30', 252],
  [null, '클린 코드 (2판)', '로버트 C. 마틴', '인사이트', 'IT · 프로그래밍',
    '애자일 소프트웨어 장인 정신. 읽기 좋은 코드가 왜 중요한지, 나쁜 코드를 어떻게 좋은 코드로 바꾸는지에 대한 고전.',
    COVER('40175/21/cover500/8966265529_1'), '2025-03-01', 584],
  [null, '인스파이어드', '마티 케이건', '제이펍', 'IT · 프로그래밍',
    '감동을 전하는 IT 제품은 어떻게 만들어지는가. 실리콘밸리 최고의 제품 조직들이 일하는 방식을 담은 제품 기획의 필독서.',
    COVER('17665/92/cover500/k122534513_2'), '2018-12-07', 400],
  [null, '하드씽', '벤 호로위츠', '한국경제신문', '경제경영',
    '경영의 난제를 푸는 최선의 한 수. 쉬운 선택을 하지 마라, 반드시 수는 있다 — 실리콘밸리의 신화가 전하는 경영 전략.',
    COVER('26666/69/cover500/8947547034_1'), '2021-06-15', 300],
]
const bid: Record<string, number> = {}
for (const b of books) bid[b[1]] = Number(insBook.run(...b).lastInsertRowid)

const ts = (d: string, h = '10:00:00') => `${d} ${h}`
const insLoan = db.prepare(
  `INSERT INTO loans (book_id, user_id, loaned_at, due_at, returned_at) VALUES (?, ?, ?, ?, ?)`,
)
const due = (loaned: string) => {
  const dt = new Date(`${loaned}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + 14)
  return dt.toISOString().slice(0, 19).replace('T', ' ')
}
// 반납 완료 (달력·랭킹·읽은 책·책쌓기용 — 날짜 분산)
const done: [string, string, string, string][] = [
  // [책, 유저, 대출일, 반납일]
  ['함께 자라기', '김민우', '2026-08-20', '2026-09-02'],
  ['하드씽', '김민우', '2026-08-25', '2026-09-06'],
  ['팀장의 탄생', '김민우', '2026-08-29', '2026-09-11'],
  ['클린 코드 (2판)', '한상우', '2026-07-02', '2026-07-14'],
  ['하드씽', '한상우', '2026-07-20', '2026-08-01'],
  ['인스파이어드', '한상우', '2026-08-05', '2026-08-18'],
  ['함께 자라기', '한상우', '2026-08-22', '2026-09-04'],
  ['팀장의 탄생', '임준영', '2026-07-10', '2026-07-22'],
  ['하드씽', '임준영', '2026-08-11', '2026-08-24'],
  ['클린 코드 (2판)', '임준영', '2026-08-26', '2026-09-08'],
  ['함께 자라기', '이서연', '2026-08-01', '2026-08-12'],
  ['인스파이어드', '이서연', '2026-08-28', '2026-09-09'],
  ['클린 코드 (2판)', '박지훈', '2026-07-15', '2026-07-28'],
  ['함께 자라기', '박지훈', '2026-09-01', '2026-09-10'],
  ['팀장의 탄생', '최은지', '2026-08-14', '2026-08-27'],
  ['하드씽', '오유진', '2026-08-30', '2026-09-12'],
]
for (const [b, u, l, r] of done) insLoan.run(bid[b], uid[u], ts(l), due(l), ts(r, '18:30:00'))
// 진행 중 (클린코드=김민우 D-10, 실리콘밸리=한상우 → 김민우가 예약)
insLoan.run(bid['클린 코드 (2판)'], uid['김민우'], ts('2026-09-10'), due('2026-09-10'), null)
insLoan.run(bid['실리콘밸리의 팀장들'], uid['한상우'], ts('2026-09-08'), due('2026-09-08'), null)
// 연체 1건 (인스파이어드=정다은, 8/27 대출 → 9/10 기한)
insLoan.run(bid['인스파이어드'], uid['정다은'], ts('2026-08-27'), due('2026-08-27'), null)

db.prepare(`INSERT INTO reservations (book_id, user_id, created_at, status) VALUES (?, ?, ?, 'waiting')`)
  .run(bid['실리콘밸리의 팀장들'], uid['김민우'], ts('2026-09-09'))

const insReview = db.prepare(
  `INSERT INTO reviews (book_id, user_id, rating, content, created_at) VALUES (?, ?, ?, ?, ?)`,
)
const reviews: [string, string, number, string, string][] = [
  ['팀장의 탄생', '한상우', 5, '팀장 달고 첫 달에 읽었으면 시행착오 절반은 줄였을 책. 1:1 미팅 챕터는 바로 써먹었다.', '2026-09-01'],
  ['팀장의 탄생', '최은지', 4, '관리자가 아니어도 좋은 피드백이 뭔지 배울 수 있어요. 후배 멘토링에 도움 됐습니다.', '2026-09-03'],
  ['팀장의 탄생', '박지훈', 4, '사례가 실리콘밸리 중심이라 다 맞진 않지만 원칙은 어디든 통한다.', '2026-09-05'],
  ['함께 자라기', '김민우', 5, '혼자 잘하는 것보다 함께 자라는 게 왜 중요한지. 개발팀 필독서.', '2026-09-02'],
  ['함께 자라기', '이서연', 5, '비개발자인데도 재밌게 읽었어요. 스터디 문화 만들 때 참고했습니다.', '2026-08-13'],
  ['하드씽', '임준영', 4, '경영서지만 리더 역할을 맡은 누구에게나 와닿는 이야기.', '2026-08-25'],
  ['클린 코드 (2판)', '박지훈', 4, '2판이라 예제가 최신이라 좋다. 신입 온보딩 교재로 추천.', '2026-07-29'],
  ['인스파이어드', '이서연', 4, '기획자 관점에서 제품을 보는 눈이 달라지는 책.', '2026-09-10'],
]
const reviewIds: number[] = []
for (const [b, u, r, c, d] of reviews)
  reviewIds.push(Number(insReview.run(bid[b], uid[u], r, c, ts(d, '14:00:00')).lastInsertRowid))

const insVote = db.prepare(`INSERT INTO review_votes (review_id, user_id, created_at) VALUES (?, ?, ?)`)
insVote.run(reviewIds[0], uid['김민우'], ts('2026-09-02'))
insVote.run(reviewIds[0], uid['이서연'], ts('2026-09-02'))
insVote.run(reviewIds[0], uid['박지훈'], ts('2026-09-04'))
insVote.run(reviewIds[1], uid['김민우'], ts('2026-09-04'))
insVote.run(reviewIds[3], uid['한상우'], ts('2026-09-03'))
insVote.run(reviewIds[3], uid['서지민'], ts('2026-09-05'))

db.prepare(`INSERT INTO wishlists (user_id, book_id, created_at) VALUES (?, ?, ?)`)
  .run(uid['김민우'], bid['인스파이어드'], ts('2026-09-07'))
db.prepare(`INSERT INTO wishlists (user_id, book_id, created_at) VALUES (?, ?, ?)`)
  .run(uid['정다은'], bid['팀장의 탄생'], ts('2026-09-08'))

db.prepare(
  `INSERT INTO purchase_requests (user_id, title, author, reason, created_at, status)
   VALUES (?, ?, ?, ?, ?, 'requested')`,
).run(uid['김민우'], '프로덕트 오너', '김성한', 'PM 공부하고 싶어요', ts('2026-09-12'))

const insPost = db.prepare(
  `INSERT INTO posts (user_id, book_id, image_path, caption, created_at) VALUES (?, ?, ?, ?, ?)`,
)
const p1 = Number(insPost.run(uid['이서연'], bid['함께 자라기'], COVER('17597/74/cover500/8966262333_1'),
  '점심시간 옥상 독서 15분. 짧아도 매일 하는 게 중요하다길래 시작했어요', ts('2026-09-12', '12:40:00')).lastInsertRowid)
const p2 = Number(insPost.run(uid['김민우'], bid['하드씽'], COVER('26666/69/cover500/8947547034_1'),
  '하드씽 완독! "쉬운 선택을 하지 마라"는 문장이 오래 남네요. 다음은 클린 코드 2판.', ts('2026-09-06', '19:10:00')).lastInsertRowid)
const insLike = db.prepare(`INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)`)
insLike.run(p1, uid['한상우'], ts('2026-09-12', '13:00:00'))
insLike.run(p1, uid['정다은'], ts('2026-09-12', '13:30:00'))
insLike.run(p2, uid['이서연'], ts('2026-09-06', '20:00:00'))
db.prepare(`INSERT INTO post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)`)
  .run(p1, uid['한상우'], '저도 옥상팀 합류할게요', ts('2026-09-12', '13:05:00'))
db.prepare(`INSERT INTO post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)`)
  .run(p1, uid['정다은'], '내일 같이 읽어요!', ts('2026-09-12', '13:35:00'))

db.prepare(
  `INSERT INTO reports (reporter_id, target_type, target_id, reason, status, created_at)
   VALUES (?, 'book', ?, ?, 'pending', ?)`,
).run(uid['오유진'], bid['하드씽'], '215쪽에 낙서가 있어요', ts('2026-09-12'))

const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
console.log('미니 시드 완료:',
  `users=${count('users')}, books=${count('books')}, loans=${count('loans')},`,
  `reviews=${count('reviews')}, votes=${count('review_votes')}, posts=${count('posts')},`,
  `reservations=${count('reservations')}, wishlists=${count('wishlists')}, requests=${count('purchase_requests')}, reports=${count('reports')}`)
