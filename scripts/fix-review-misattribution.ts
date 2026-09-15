// 일회성 교정 스크립트. enrich-reviews.ts 초기 버전이 리뷰어 풀에 실제 가입 계정까지
// 포함시켜서, 실사용자가 쓴 적 없는 합성 한줄평이 그 계정 이름으로 달리는 문제가 있었다
// (예: 유자선 계정에 "출퇴근길에 읽기 딱 좋은 호흡이었어요." 같은 문장이 자동으로 붙음).
// 이 스크립트는 그 실행 한 번으로 잘못 붙은 행만 정확히 찾아 지운다.
//
// 안전장치: 실행 당시 정확히 알고 있던 총계(users=79, reviews=2647, review_votes=3456)와
// 지금 DB의 총계가 다르면 즉시 중단한다 — 그 사이 실제 활동(가입·리뷰 작성)이 있었다면
// "새로 추가된 행 = 마지막 N개"라는 가정이 더 이상 안전하지 않기 때문이다.
// 실행: npx tsx scripts/fix-review-misattribution.ts
import 'dotenv/config'
import { initDb } from '../server/db/connection'

// enrich-reviews.ts를 실행하기 직전(사고가 나기 전) 확인했던 정확한 값.
const EXPECTED_USERS_BEFORE = 19
const EXPECTED_NEW_USERS = 60
const EXPECTED_REVIEWS_TOTAL = 2647
const EXPECTED_VOTES_TOTAL = 3456

function main(): void {
  const db = initDb()

  const totalUsers = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
  const totalReviews = (db.prepare('SELECT COUNT(*) AS c FROM reviews').get() as { c: number }).c
  const totalVotes = (db.prepare('SELECT COUNT(*) AS c FROM review_votes').get() as { c: number }).c

  if (
    totalUsers !== EXPECTED_USERS_BEFORE + EXPECTED_NEW_USERS ||
    totalReviews !== EXPECTED_REVIEWS_TOTAL ||
    totalVotes !== EXPECTED_VOTES_TOTAL
  ) {
    console.error(
      `안전 점검 실패 — 예상치 못한 변화가 있었어요(users=${totalUsers}, reviews=${totalReviews}, ` +
        `votes=${totalVotes}). 이 스크립트는 그 사이 아무 활동도 없었다는 가정 위에서만 안전해요. ` +
        `중단합니다 — 아무것도 지우지 않았어요.`
    )
    process.exitCode = 1
    return
  }

  // id 오름차순 정렬 — better-sqlite3(단일 프로세스, 동기 쓰기)에서 AUTOINCREMENT id는
  // 곧 삽입 순서다. 가장 낮은 EXPECTED_USERS_BEFORE명이 사고 이전부터 있던 계정
  // (고정 시드 12명 + 실제 가입자), 나머지가 enrich-reviews.ts가 새로 만든 합성 인물이다.
  const usersByIdAsc = db.prepare('SELECT id, name FROM users ORDER BY id ASC').all() as {
    id: number
    name: string
  }[]
  const preexistingUsers = usersByIdAsc.slice(0, EXPECTED_USERS_BEFORE)
  const preexistingUserIds = new Set(preexistingUsers.map((u) => u.id))

  console.log('사고 이전부터 있던 계정(건드리지 않음):', preexistingUsers.map((u) => u.name).join(', '))

  // 같은 논리로, 전체 리뷰 중 뒤쪽(enrich-reviews.ts가 새로 넣은) 행만 대상으로 하고,
  // 그중 작성자가 preexistingUserIds인 것만 "잘못 붙은 리뷰"로 판정한다.
  const reviewsByIdAsc = db.prepare('SELECT id, user_id FROM reviews ORDER BY id ASC').all() as {
    id: number
    user_id: number
  }[]
  const newReviewsStart = EXPECTED_REVIEWS_TOTAL - 2628 // = 사고 이전 리뷰 수(19)
  const newReviews = reviewsByIdAsc.slice(newReviewsStart)
  const misattributedReviewIds = newReviews.filter((r) => preexistingUserIds.has(r.user_id)).map((r) => r.id)

  const votesByIdAsc = db.prepare('SELECT id, review_id, user_id FROM review_votes ORDER BY id ASC').all() as {
    id: number
    review_id: number
    user_id: number
  }[]
  const newVotesStart = EXPECTED_VOTES_TOTAL - 3441 // = 사고 이전 추천 수(15)
  const newVotes = votesByIdAsc.slice(newVotesStart)
  const misattributedVoteIdsByVoter = newVotes.filter((v) => preexistingUserIds.has(v.user_id)).map((v) => v.id)

  console.log(`잘못 붙은 리뷰: ${misattributedReviewIds.length}건`)
  console.log(`잘못 붙은 추천(작성자 기준): ${misattributedVoteIdsByVoter.length}건`)

  const misattributedReviewIdSet = new Set(misattributedReviewIds)
  // 삭제할 리뷰를 가리키는 추천은(추천인이 누구든) FK 위반을 피하려면 먼저 지워야 한다.
  const votesOnRemovedReviews = votesByIdAsc.filter((v) => misattributedReviewIdSet.has(v.review_id)).map((v) => v.id)

  const voteIdsToDelete = new Set([...misattributedVoteIdsByVoter, ...votesOnRemovedReviews])

  const delVote = db.prepare('DELETE FROM review_votes WHERE id = ?')
  for (const id of voteIdsToDelete) delVote.run(id)

  const delReview = db.prepare('DELETE FROM reviews WHERE id = ?')
  for (const id of misattributedReviewIds) delReview.run(id)

  const finalUsers = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
  const finalReviews = (db.prepare('SELECT COUNT(*) AS c FROM reviews').get() as { c: number }).c
  const finalVotes = (db.prepare('SELECT COUNT(*) AS c FROM review_votes').get() as { c: number }).c

  console.log('\n--- 교정 완료 ---')
  console.log(`지운 리뷰: ${misattributedReviewIds.length}건, 지운 추천: ${voteIdsToDelete.size}건`)
  console.log(`최종 users: ${finalUsers}명, reviews: ${finalReviews}건, review_votes: ${finalVotes}건`)
}

main()
