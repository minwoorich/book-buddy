import { getDb } from '../db/connection'
import type { Book, Post } from '../../shared/types'

interface PostRow {
  id: number
  user_id: number
  book_id: number | null
  image_path: string
  caption: string | null
  created_at: string
}

interface PostJoinRow extends PostRow {
  user_name: string
  department: string
  like_count: number
  liked_by_me: number
  comment_count: number
  bk_id: number | null
  bk_isbn13: string | null
  bk_title: string | null
  bk_author: string | null
  bk_publisher: string | null
  bk_category: string | null
  bk_description: string | null
  bk_cover_url: string | null
  bk_pub_date: string | null
  bk_page_count: number | null
}

export type PostWithMeta = Post & {
  userName: string
  department: string
  book: Book | null
  likeCount: number
  likedByMe: boolean
  commentCount: number
}

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    imagePath: row.image_path,
    caption: row.caption,
    createdAt: row.created_at,
  }
}

function toPostWithMeta(row: PostJoinRow): PostWithMeta {
  return {
    ...toPost(row),
    userName: row.user_name,
    department: row.department,
    book: row.bk_id
      ? {
          id: row.bk_id,
          isbn13: row.bk_isbn13,
          title: row.bk_title as string,
          author: row.bk_author as string,
          publisher: row.bk_publisher,
          category: row.bk_category as string,
          description: row.bk_description,
          coverUrl: row.bk_cover_url,
          pubDate: row.bk_pub_date,
          pageCount: row.bk_page_count,
        }
      : null,
    likeCount: row.like_count,
    likedByMe: Boolean(row.liked_by_me),
    commentCount: row.comment_count,
  }
}

export const postRepo = {
  /** 최신순 피드. meId가 있으면 likedByMe도 채운다. */
  listAll(meId?: number): PostWithMeta[] {
    const rows = getDb()
      .prepare(
        `SELECT p.*, u.name AS user_name, u.department AS department,
                (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
                EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = ?) AS liked_by_me,
                (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
                b.id AS bk_id, b.isbn13 AS bk_isbn13, b.title AS bk_title, b.author AS bk_author,
                b.publisher AS bk_publisher, b.category AS bk_category, b.description AS bk_description,
                b.cover_url AS bk_cover_url, b.pub_date AS bk_pub_date, b.page_count AS bk_page_count
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN books b ON b.id = p.book_id
         ORDER BY p.created_at DESC`
      )
      .all(meId ?? 0) as PostJoinRow[]
    return rows.map(toPostWithMeta)
  },

  findById(id: number): Post | undefined {
    const row = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined
    return row ? toPost(row) : undefined
  },

  insert(userId: number, imagePath: string, caption: string | null, bookId: number | null): Post {
    const result = getDb()
      .prepare('INSERT INTO posts (user_id, book_id, image_path, caption) VALUES (?, ?, ?, ?)')
      .run(userId, bookId, imagePath, caption)
    return toPost(
      getDb().prepare('SELECT * FROM posts WHERE id = ?').get(Number(result.lastInsertRowid)) as PostRow
    )
  },
}
