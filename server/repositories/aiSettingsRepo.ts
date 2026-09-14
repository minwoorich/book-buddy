import { getDb } from '../db/connection'
import { AI_DEFAULTS, isAiFeatureKey } from '../ai/defaults'
import type { AiSetting } from '../../shared/types'

interface AiSettingRow {
  id: number
  feature_key: string
  system_prompt: string
  model: string
  max_tokens: number
  temperature: number
  recursion_limit: number | null
  updated_at: string
}

function toAiSetting(row: AiSettingRow): AiSetting {
  return {
    id: row.id,
    featureKey: row.feature_key,
    systemPrompt: row.system_prompt,
    model: row.model,
    maxTokens: row.max_tokens,
    temperature: row.temperature,
    recursionLimit: row.recursion_limit,
    updatedAt: row.updated_at,
  }
}

export interface AiSettingPatch {
  systemPrompt?: string
  model?: string
  maxTokens?: number
  temperature?: number
  recursionLimit?: number | null
}

export const aiSettingsRepo = {
  /** feature_key 순 전체 3행 — 관리자 설정 화면용. */
  listAll(): AiSetting[] {
    const rows = getDb().prepare('SELECT * FROM ai_settings ORDER BY feature_key ASC').all() as AiSettingRow[]
    return rows.map(toAiSetting)
  },

  findByKey(key: string): AiSetting | undefined {
    const row = getDb().prepare('SELECT * FROM ai_settings WHERE feature_key = ?').get(key) as
      | AiSettingRow
      | undefined
    return row ? toAiSetting(row) : undefined
  },

  /** 부분 갱신 — 넘긴 필드만 바뀌고, 나머지는 기존 값을 유지한다. updated_at은 항상 갱신. */
  update(key: string, patch: AiSettingPatch): AiSetting | undefined {
    const existing = this.findByKey(key)
    if (!existing) return undefined

    const systemPrompt = patch.systemPrompt ?? existing.systemPrompt
    const model = patch.model ?? existing.model
    const maxTokens = patch.maxTokens ?? existing.maxTokens
    const temperature = patch.temperature ?? existing.temperature
    const recursionLimit = patch.recursionLimit !== undefined ? patch.recursionLimit : existing.recursionLimit

    getDb()
      .prepare(
        `UPDATE ai_settings
         SET system_prompt = ?, model = ?, max_tokens = ?, temperature = ?, recursion_limit = ?,
             updated_at = datetime('now')
         WHERE feature_key = ?`
      )
      .run(systemPrompt, model, maxTokens, temperature, recursionLimit, key)

    return this.findByKey(key)
  },

  /** 코드에 하드코딩된 기본값(server/ai/defaults.ts)으로 되돌린다. */
  resetToDefault(key: string): AiSetting | undefined {
    if (!isAiFeatureKey(key)) return undefined
    const existing = this.findByKey(key)
    if (!existing) return undefined

    const d = AI_DEFAULTS[key]
    getDb()
      .prepare(
        `UPDATE ai_settings
         SET system_prompt = ?, model = ?, max_tokens = ?, temperature = ?, recursion_limit = ?,
             updated_at = datetime('now')
         WHERE feature_key = ?`
      )
      .run(d.systemPrompt, d.model, d.maxTokens, d.temperature, d.recursionLimit, key)

    return this.findByKey(key)
  },
}
