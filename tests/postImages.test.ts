import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { postImageRepo } from '../server/repositories/postImageRepo'
import { postRepo } from '../server/repositories/postRepo'

function insertUser(): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year, role)
       VALUES ('테스터', '바텍', '개발본부', 'SW개발팀', '사원', 'M', 1996, 'member')`
    )
    .run()
  return Number(result.lastInsertRowid)
}

beforeEach(() => {
  initDb(':memory:')
})

describe('postImageRepo', () => {
  it('insertMany로 넣은 사진을 sort_order 순서대로 listByPost가 돌려준다', () => {
    const userId = insertUser()
    const post = postRepo.insert(userId, '/api/uploads/first.jpg', null, null)
    postImageRepo.insertMany(post.id, ['/api/uploads/a.jpg', '/api/uploads/b.jpg', '/api/uploads/c.jpg'])

    expect(postImageRepo.listByPost(post.id)).toEqual([
      '/api/uploads/a.jpg',
      '/api/uploads/b.jpg',
      '/api/uploads/c.jpg',
    ])
  })

  it('post_images가 없는 게시물은 빈 배열을 돌려준다', () => {
    const userId = insertUser()
    const post = postRepo.insert(userId, '/api/uploads/only.jpg', null, null)
    expect(postImageRepo.listByPost(post.id)).toEqual([])
  })

  it('listByPosts는 여러 게시물의 사진을 postId별로 묶는다', () => {
    const userId = insertUser()
    const postA = postRepo.insert(userId, '/api/uploads/a1.jpg', null, null)
    const postB = postRepo.insert(userId, '/api/uploads/b1.jpg', null, null)
    postImageRepo.insertMany(postA.id, ['/api/uploads/a1.jpg', '/api/uploads/a2.jpg'])

    const map = postImageRepo.listByPosts([postA.id, postB.id])
    expect(map.get(postA.id)).toEqual(['/api/uploads/a1.jpg', '/api/uploads/a2.jpg'])
    expect(map.has(postB.id)).toBe(false)
  })
})

describe('postRepo.listAll images', () => {
  it('post_images가 있으면 그 목록을, 없으면 image_path 단일 배열을 images로 돌려준다', () => {
    const userId = insertUser()
    const multi = postRepo.insert(userId, '/api/uploads/m1.jpg', '여러 장', null)
    postImageRepo.insertMany(multi.id, ['/api/uploads/m1.jpg', '/api/uploads/m2.jpg'])
    const single = postRepo.insert(userId, '/api/uploads/s1.jpg', '한 장', null)

    const all = postRepo.listAll()
    const multiResult = all.find((p) => p.id === multi.id)
    const singleResult = all.find((p) => p.id === single.id)

    expect(multiResult?.images).toEqual(['/api/uploads/m1.jpg', '/api/uploads/m2.jpg'])
    expect(singleResult?.images).toEqual(['/api/uploads/s1.jpg'])
  })
})
