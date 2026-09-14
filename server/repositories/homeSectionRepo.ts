import { getDb } from '../db/connection'
import type { HomeSection } from '../../shared/types'

interface HomeSectionRow {
  id: number
  section_key: string
  title: string
  enabled: number
  sort_order: number
}

function toHomeSection(row: HomeSectionRow): HomeSection {
  return {
    id: row.id,
    sectionKey: row.section_key,
    title: row.title,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
  }
}

export const homeSectionRepo = {
  /** 전체 섹션(비노출 포함), sort_order 순 — 관리자 설정 화면용. */
  listAll(): HomeSection[] {
    const rows = getDb().prepare('SELECT * FROM home_sections ORDER BY sort_order ASC').all() as HomeSectionRow[]
    return rows.map(toHomeSection)
  },

  /** 노출(enabled=1) 섹션만, sort_order 순 — 홈 화면용. */
  listEnabled(): HomeSection[] {
    const rows = getDb()
      .prepare('SELECT * FROM home_sections WHERE enabled = 1 ORDER BY sort_order ASC')
      .all() as HomeSectionRow[]
    return rows.map(toHomeSection)
  },

  findById(id: number): HomeSection | undefined {
    const row = getDb().prepare('SELECT * FROM home_sections WHERE id = ?').get(id) as HomeSectionRow | undefined
    return row ? toHomeSection(row) : undefined
  },

  /** enabled/sortOrder 부분 갱신. 없는 id면 undefined. */
  update(id: number, patch: { enabled?: boolean; sortOrder?: number }): HomeSection | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const enabled = patch.enabled ?? existing.enabled
    const sortOrder = patch.sortOrder ?? existing.sortOrder
    getDb()
      .prepare('UPDATE home_sections SET enabled = ?, sort_order = ? WHERE id = ?')
      .run(enabled ? 1 : 0, sortOrder, id)
    return this.findById(id)
  },
}
