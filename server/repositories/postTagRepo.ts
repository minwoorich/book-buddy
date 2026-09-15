import { getDb } from '../db/connection'

/** 게시물 해시태그(post_tags). 정규화는 shared/utils/hashtags에서 끝내고 여기는 저장·조회만 한다. */
export const postTagRepo = {
  /** 게시물의 태그를 통째로 바꾼다(빈 배열이면 전부 삭제). 순서는 배열 순서. */
  replace(postId: number, tags: string[]): void {
    const db = getDb()
    const run = db.transaction((id: number, list: string[]) => {
      db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(id)
      const stmt = db.prepare('INSERT INTO post_tags (post_id, tag, sort_order) VALUES (?, ?, ?)')
      list.forEach((tag, sortOrder) => stmt.run(id, tag, sortOrder))
    })
    run(postId, tags)
  },

  listByPost(postId: number): string[] {
    const rows = getDb()
      .prepare('SELECT tag FROM post_tags WHERE post_id = ? ORDER BY sort_order ASC')
      .all(postId) as { tag: string }[]
    return rows.map((row) => row.tag)
  },

  /** 많이 쓰인 태그 순으로 limit개. 표기가 다른 같은 태그(대소문자)는 가장 많이 쓰인 표기로 합친다. */
  popular(limit = 12): { tag: string; count: number }[] {
    const rows = getDb()
      .prepare(
        `SELECT tag, COUNT(*) AS count FROM post_tags
         GROUP BY tag COLLATE NOCASE
         ORDER BY count DESC, MAX(id) DESC
         LIMIT ?`
      )
      .all(limit) as { tag: string; count: number }[]
    return rows
  },

  /** 여러 게시물의 태그를 한 번에 조회해 postId별로 묶는다(피드 목록에서 N+1 방지). */
  listByPosts(postIds: number[]): Map<number, string[]> {
    const map = new Map<number, string[]>()
    if (postIds.length === 0) return map
    const placeholders = postIds.map(() => '?').join(',')
    const rows = getDb()
      .prepare(
        `SELECT post_id, tag FROM post_tags
         WHERE post_id IN (${placeholders}) ORDER BY sort_order ASC`
      )
      .all(...postIds) as { post_id: number; tag: string }[]
    for (const row of rows) {
      const list = map.get(row.post_id)
      if (list) list.push(row.tag)
      else map.set(row.post_id, [row.tag])
    }
    return map
  },
}
