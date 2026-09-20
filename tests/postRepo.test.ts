import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { postImageRepo } from '../server/repositories/postImageRepo'
import { postRepo } from '../server/repositories/postRepo'
import { postTagRepo } from '../server/repositories/postTagRepo'

function insertUser(name: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES (?, '바텍', '개발본부', 'SW개발팀', '사원', 'M', 1996, 'member')`
    )
    .run(name)
  return Number(result.lastInsertRowid)
}

beforeEach(() => {
  initDb(':memory:')
})

describe('postRepo (QA #59·#60)', () => {
  it('mine 옵션은 내 게시물만 최신순으로 돌려주고, meId가 없으면 빈 목록이다', () => {
    const me = insertUser('나')
    const other = insertUser('동료')
    const mineOld = postRepo.insert(me, '/api/uploads/a.jpg', '첫 글', null)
    postRepo.insert(other, '/api/uploads/b.jpg', '남의 글', null)
    const mineNew = postRepo.insert(me, '/api/uploads/c.jpg', '둘째 글', null)

    expect(postRepo.listAll(me)).toHaveLength(3)

    const mine = postRepo.listAll(me, { mine: true })
    expect(mine.map((p) => p.id)).toEqual([mineNew.id, mineOld.id])
    expect(postRepo.listAll(undefined, { mine: true })).toEqual([])
  })

  it('update는 캡션·책 태그만 바꾸고 사진은 그대로 둔다', () => {
    const me = insertUser('나')
    const post = postRepo.insert(me, '/api/uploads/a.jpg', '원래 캡션', null)
    const updated = postRepo.update(post.id, { caption: '고친 캡션', bookId: null })
    expect(updated?.caption).toBe('고친 캡션')
    expect(updated?.imagePath).toBe('/api/uploads/a.jpg')
  })

  it('remove는 사진·좋아요·댓글까지 지우고 삭제된 사진 경로를 돌려준다', () => {
    const me = insertUser('나')
    const other = insertUser('동료')
    const post = postRepo.insert(me, '/api/uploads/a.jpg', null, null)
    postImageRepo.insertMany(post.id, ['/api/uploads/a.jpg', '/api/uploads/b.jpg'])
    getDb().prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(post.id, other)
    getDb()
      .prepare("INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, '멋져요')")
      .run(post.id, other)

    const removed = postRepo.remove(post.id)
    expect([...removed].sort()).toEqual(['/api/uploads/a.jpg', '/api/uploads/b.jpg'])
    expect(postRepo.findById(post.id)).toBeUndefined()
    expect(postImageRepo.listByPost(post.id)).toEqual([])
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM post_likes').get()).toEqual({ c: 0 })
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM post_comments').get()).toEqual({ c: 0 })
  })

  it('tags를 여러 개 넘기면 하나라도 달린 글이 중복 없이 나온다', () => {
    const me = insertUser('나')
    const rooftop = postRepo.insert(me, '/api/uploads/a.jpg', '옥상 글', null)
    postTagRepo.replace(rooftop.id, ['옥상'])
    const done = postRepo.insert(me, '/api/uploads/b.jpg', '완독 글', null)
    postTagRepo.replace(done.id, ['완독'])
    const both = postRepo.insert(me, '/api/uploads/c.jpg', '둘 다', null)
    postTagRepo.replace(both.id, ['옥상', '완독'])
    const none = postRepo.insert(me, '/api/uploads/d.jpg', '태그 없음', null)

    const ids = postRepo.listAll(me, { tags: ['옥상', '완독'] }).map((p) => p.id)
    expect(ids).toEqual([both.id, done.id, rooftop.id])
    expect(ids).not.toContain(none.id)
  })

  it('tags 필터는 대소문자를 무시하고, 빈 배열이면 전체를 돌려준다', () => {
    const me = insertUser('나')
    const post = postRepo.insert(me, '/api/uploads/a.jpg', '북클럽', null)
    postTagRepo.replace(post.id, ['BookClub'])
    postRepo.insert(me, '/api/uploads/b.jpg', '다른 글', null)

    expect(postRepo.listAll(me, { tags: ['bookclub'] }).map((p) => p.id)).toEqual([post.id])
    expect(postRepo.listAll(me, { tags: [] })).toHaveLength(2)
  })

  it('없는 게시물을 remove하면 빈 배열이다', () => {
    expect(postRepo.remove(999)).toEqual([])
  })
})
