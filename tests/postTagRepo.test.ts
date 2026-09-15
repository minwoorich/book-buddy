import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { postRepo } from '../server/repositories/postRepo'
import { postTagRepo } from '../server/repositories/postTagRepo'

function insertUser(name = '테스터'): number {
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

describe('postTagRepo', () => {
  it('replace로 넣은 태그를 순서대로 돌려주고, 다시 replace하면 통째로 바뀐다', () => {
    const me = insertUser()
    const post = postRepo.insert(me, '/api/uploads/a.jpg', null, null)
    postTagRepo.replace(post.id, ['독서', '옥상'])
    expect(postTagRepo.listByPost(post.id)).toEqual(['독서', '옥상'])

    postTagRepo.replace(post.id, ['퇴근후'])
    expect(postTagRepo.listByPost(post.id)).toEqual(['퇴근후'])

    postTagRepo.replace(post.id, [])
    expect(postTagRepo.listByPost(post.id)).toEqual([])
  })

  it('listByPosts는 여러 게시물의 태그를 postId별로 묶는다', () => {
    const me = insertUser()
    const a = postRepo.insert(me, '/api/uploads/a.jpg', null, null)
    const b = postRepo.insert(me, '/api/uploads/b.jpg', null, null)
    postTagRepo.replace(a.id, ['독서'])
    postTagRepo.replace(b.id, ['옥상', '점심'])
    const map = postTagRepo.listByPosts([a.id, b.id])
    expect(map.get(a.id)).toEqual(['독서'])
    expect(map.get(b.id)).toEqual(['옥상', '점심'])
    expect(postTagRepo.listByPosts([]).size).toBe(0)
  })

  it('popular는 많이 쓰인 태그부터 돌려준다', () => {
    const me = insertUser()
    const a = postRepo.insert(me, '/api/uploads/a.jpg', null, null)
    const b = postRepo.insert(me, '/api/uploads/b.jpg', null, null)
    const c = postRepo.insert(me, '/api/uploads/c.jpg', null, null)
    postTagRepo.replace(a.id, ['독서', '옥상'])
    postTagRepo.replace(b.id, ['독서', '카페'])
    postTagRepo.replace(c.id, ['독서'])

    const popular = postTagRepo.popular(2)
    expect(popular[0]).toEqual({ tag: '독서', count: 3 })
    expect(popular).toHaveLength(2)
  })
})

describe('postRepo 태그 연동', () => {
  it('listAll은 각 게시물에 tags를 실어 주고, tag 옵션으로 해당 태그 게시물만 거른다', () => {
    const me = insertUser()
    const a = postRepo.insert(me, '/api/uploads/a.jpg', '옥상에서', null)
    const b = postRepo.insert(me, '/api/uploads/b.jpg', '카페에서', null)
    postTagRepo.replace(a.id, ['옥상', '독서'])
    postTagRepo.replace(b.id, ['카페', '독서'])

    const all = postRepo.listAll(me)
    expect(all.find((p) => p.id === a.id)?.tags).toEqual(['옥상', '독서'])
    expect(all.find((p) => p.id === b.id)?.tags).toEqual(['카페', '독서'])

    expect(postRepo.listAll(me, { tag: '옥상' }).map((p) => p.id)).toEqual([a.id])
    expect(postRepo.listAll(me, { tag: '독서' })).toHaveLength(2)
    expect(postRepo.listAll(me, { tag: '없는태그' })).toEqual([])
    // 대소문자 무시
    postTagRepo.replace(b.id, ['Book'])
    expect(postRepo.listAll(me, { tag: 'book' }).map((p) => p.id)).toEqual([b.id])
  })

  it('remove는 태그까지 지운다', () => {
    const me = insertUser()
    const post = postRepo.insert(me, '/api/uploads/a.jpg', null, null)
    postTagRepo.replace(post.id, ['독서'])
    postRepo.remove(post.id)
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM post_tags').get()).toEqual({ c: 0 })
  })
})
