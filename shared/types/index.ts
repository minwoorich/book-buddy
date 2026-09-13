export interface User {
  id: number
  name: string
  company: string
  department: string
  team: string
  position: string
  gender: 'M' | 'F'
  birthYear: number
  role: 'member' | 'admin'
}

export interface Book {
  id: number
  isbn13: string | null
  title: string
  author: string
  publisher: string | null
  category: string
  description: string | null
  coverUrl: string | null
  pubDate: string | null
  pageCount: number | null
}

export type NewBook = Omit<Book, 'id'>

export interface Loan {
  id: number
  bookId: number
  userId: number
  loanedAt: string
  dueAt: string
  returnedAt: string | null
}

export interface Reservation {
  id: number
  bookId: number
  userId: number
  createdAt: string
  status: 'waiting' | 'canceled' | 'fulfilled'
}

export interface Review {
  id: number
  bookId: number
  userId: number
  rating: number
  content: string
  createdAt: string
}

export interface ReviewVote {
  id: number
  reviewId: number
  userId: number
  createdAt: string
}

export interface Wishlist {
  id: number
  userId: number
  bookId: number
  createdAt: string
}

export interface PurchaseRequest {
  id: number
  userId: number
  title: string
  author: string | null
  isbn13: string | null
  coverUrl: string | null
  reason: string | null
  createdAt: string
  status: 'requested' | 'approved' | 'rejected'
}

export interface Post {
  id: number
  userId: number
  bookId: number | null
  imagePath: string
  caption: string | null
  createdAt: string
}

export interface PostComment {
  id: number
  postId: number
  userId: number
  content: string
  createdAt: string
}

export interface Report {
  id: number
  reporterId: number
  targetType: 'book' | 'post' | 'review'
  targetId: number
  reason: string
  status: 'pending' | 'resolved'
  createdAt: string
}

export interface ChatAction {
  type: 'navigate'
  label: string
  to: string
}

export interface AiAnswer {
  message: string
  bookIds: number[]
  actions: ChatAction[]
}

export interface RankRow {
  key: string
  label: string
  sub?: string
  count: number
  userId?: number
}

export interface StatRow {
  label: string
  loanCount: number
  doneCount: number
  headCount: number
  perHead: number
}
