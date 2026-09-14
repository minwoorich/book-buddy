import { getDb } from '../db/connection'

export const postImageRepo = {
  /** 게시물 사진 여러 장을 배열 순서대로 sort_order를 매겨 저장한다. */
  insertMany(postId: number, imagePaths: string[]): void {
    const stmt = getDb().prepare(
      'INSERT INTO post_images (post_id, image_path, sort_order) VALUES (?, ?, ?)'
    )
    imagePaths.forEach((imagePath, sortOrder) => stmt.run(postId, imagePath, sortOrder))
  },

  /** 한 게시물의 사진 경로 목록, sort_order 오름차순. */
  listByPost(postId: number): string[] {
    const rows = getDb()
      .prepare('SELECT image_path FROM post_images WHERE post_id = ? ORDER BY sort_order ASC')
      .all(postId) as { image_path: string }[]
    return rows.map((row) => row.image_path)
  },

  /** 여러 게시물의 사진을 한 번에 조회해 postId별로 묶는다(피드 목록에서 N+1 방지). */
  listByPosts(postIds: number[]): Map<number, string[]> {
    const map = new Map<number, string[]>()
    if (postIds.length === 0) return map
    const placeholders = postIds.map(() => '?').join(',')
    const rows = getDb()
      .prepare(
        `SELECT post_id, image_path FROM post_images
         WHERE post_id IN (${placeholders}) ORDER BY sort_order ASC`
      )
      .all(...postIds) as { post_id: number; image_path: string }[]
    for (const row of rows) {
      const list = map.get(row.post_id)
      if (list) list.push(row.image_path)
      else map.set(row.post_id, [row.image_path])
    }
    return map
  },
}
