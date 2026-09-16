import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../server/db/connection'
import { reviewRepo } from '../server/repositories/reviewRepo'

function insertUser(name: string, org: { company: string; department: string; team: string }): number {
  const result = getDb()
    .prepare(
      `INSERT INTO users (name, company, department, team, position, gender, birth_year)
       VALUES (?, ?, ?, ?, '사원', 'M', 1996)`
    )
    .run(name, org.company, org.department, org.team)
  return Number(result.lastInsertRowid)
}

function insertBook(title: string): number {
  const result = getDb()
    .prepare(`INSERT INTO books (title, author, category) VALUES (?, '저자', '인문')`)
    .run(title)
  return Number(result.lastInsertRowid)
}

const 바텍연구소 = { company: '바텍', department: '연구소', team: '플랫폼팀' }
const 레이언스연구소 = { company: '레이언스', department: '연구소', team: '플랫폼팀' }

let book: number

beforeEach(() => {
  initDb(':memory:')
  book = insertBook('데미안')
})

describe('reviewRepo.listAllWithMeta — 소속 필터', () => {
  it('부서로 거르면 이름이 같아도 다른 계열사의 부서는 섞이지 않는다', () => {
    const 바텍사람 = insertUser('김바텍', 바텍연구소)
    const 레이언스사람 = insertUser('박레이', 레이언스연구소)
    reviewRepo.insert(book, 바텍사람, 5, '바텍 연구소의 리뷰')
    reviewRepo.insert(book, 레이언스사람, 4, '레이언스 연구소의 리뷰')

    const rows = reviewRepo.listAllWithMeta(바텍사람, {
      sort: 'latest',
      company: '바텍',
      department: '연구소',
    })

    expect(rows.map((r) => r.content)).toEqual(['바텍 연구소의 리뷰'])
  })

  it('팀으로 거르면 같은 부서라도 다른 팀은 빠진다', () => {
    const 플랫폼 = insertUser('김플랫', 바텍연구소)
    const 영상 = insertUser('이영상', { ...바텍연구소, team: '영상팀' })
    reviewRepo.insert(book, 플랫폼, 5, '플랫폼팀 리뷰')
    reviewRepo.insert(book, 영상, 5, '영상팀 리뷰')

    const rows = reviewRepo.listAllWithMeta(플랫폼, {
      sort: 'latest',
      company: '바텍',
      department: '연구소',
      team: '플랫폼팀',
    })

    expect(rows.map((r) => r.content)).toEqual(['플랫폼팀 리뷰'])
  })

  it('계열사만 주면 그 계열사의 모든 부서가 남는다', () => {
    const 연구소 = insertUser('김연구', 바텍연구소)
    const 인사 = insertUser('이인사', { company: '바텍', department: '경영지원', team: '인사팀' })
    const 남 = insertUser('박레이', 레이언스연구소)
    reviewRepo.insert(book, 연구소, 5, '연구소')
    reviewRepo.insert(book, 인사, 5, '경영지원')
    reviewRepo.insert(book, 남, 5, '레이언스')

    const rows = reviewRepo.listAllWithMeta(연구소, { sort: 'latest', company: '바텍' })

    expect(rows.map((r) => r.content).sort()).toEqual(['경영지원', '연구소'])
  })
})

describe('reviewRepo.listAllWithMeta — 다독왕 필터', () => {
  it('topReaderIds를 주면 그 사람들의 리뷰만 남는다', () => {
    const 다독왕 = insertUser('김다독', 바텍연구소)
    const 일반 = insertUser('이일반', 바텍연구소)
    reviewRepo.insert(book, 다독왕, 5, '다독왕 리뷰')
    reviewRepo.insert(book, 일반, 5, '일반 리뷰')

    const rows = reviewRepo.listAllWithMeta(다독왕, { sort: 'latest', topReaderIds: [다독왕] })

    expect(rows.map((r) => r.content)).toEqual(['다독왕 리뷰'])
  })

  it('topReaderIds가 빈 배열이면 결과도 비어 있다 — 이달 다독왕이 아무도 없을 때', () => {
    const 누구 = insertUser('김누구', 바텍연구소)
    reviewRepo.insert(book, 누구, 5, '리뷰')

    expect(reviewRepo.listAllWithMeta(누구, { sort: 'latest', topReaderIds: [] })).toEqual([])
  })
})

describe('reviewRepo.listAllWithMeta — 별점순 정렬', () => {
  it('별점이 높은 순, 동률이면 최신순으로 내려온다', () => {
    const me = insertUser('김민우', 바텍연구소)
    const 동료 = insertUser('이동료', 바텍연구소)
    const 후배 = insertUser('박후배', 바텍연구소)
    const 낮음 = reviewRepo.insert(book, me, 2, '별 둘')
    const 높음먼저 = reviewRepo.insert(book, 동료, 5, '별 다섯 먼저')
    const 높음나중 = reviewRepo.insert(book, 후배, 5, '별 다섯 나중')
    getDb()
      .prepare(`UPDATE reviews SET created_at = ? WHERE id = ?`)
      .run('2026-09-01 00:00:00', 높음먼저.id)
    getDb()
      .prepare(`UPDATE reviews SET created_at = ? WHERE id = ?`)
      .run('2026-09-10 00:00:00', 높음나중.id)

    const rows = reviewRepo.listAllWithMeta(me, { sort: 'rating' })

    expect(rows.map((r) => r.id)).toEqual([높음나중.id, 높음먼저.id, 낮음.id])
  })
})

describe('reviewRepo.orgOptions', () => {
  it('리뷰를 남긴 사람의 소속만, 중복 없이 계열사·부서·팀으로 돌려준다', () => {
    const 글쓴이 = insertUser('김바텍', 바텍연구소)
    const 또글쓴이 = insertUser('이바텍', 바텍연구소)
    insertUser('말없는사람', { company: '레이언스', department: '영업', team: '국내영업팀' })
    reviewRepo.insert(book, 글쓴이, 5, '하나')
    reviewRepo.insert(book, 또글쓴이, 4, '둘')

    expect(reviewRepo.orgOptions()).toEqual([
      { company: '바텍', department: '연구소', team: '플랫폼팀' },
    ])
  })
})
