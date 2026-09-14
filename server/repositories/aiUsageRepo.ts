import { getDb } from '../db/connection'
import type { AiUsageRecord, AiUsageSummary } from '../../shared/types'

interface UsageSummaryRow {
  calls: number
  input_tokens: number
  output_tokens: number
}

interface AiUsageRecentRow {
  id: number
  feature_key: string
  user_id: number
  user_name: string | null
  model: string
  input_tokens: number
  output_tokens: number
  duration_ms: number
  created_at: string
}

function toRecord(row: AiUsageRecentRow): AiUsageRecord {
  return {
    id: row.id,
    featureKey: row.feature_key,
    userId: row.user_id,
    userName: row.user_name,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }
}

export const aiUsageRepo = {
  insert(
    featureKey: string,
    userId: number,
    model: string,
    inputTokens: number,
    outputTokens: number,
    durationMs: number
  ): void {
    getDb()
      .prepare(
        `INSERT INTO ai_usage (feature_key, user_id, model, input_tokens, output_tokens, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(featureKey, userId, model, inputTokens, outputTokens, durationMs)
  },

  /** 오늘(UTC datetime('now') 기준 date('now') 프리픽스)/누적 호출 수·토큰 합계. */
  summary(): AiUsageSummary {
    const db = getDb()
    const totalRow = db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens
         FROM ai_usage`
      )
      .get() as UsageSummaryRow
    const todayRow = db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens
         FROM ai_usage WHERE created_at LIKE date('now') || '%'`
      )
      .get() as UsageSummaryRow

    return {
      today: { calls: todayRow.calls, inputTokens: todayRow.input_tokens, outputTokens: todayRow.output_tokens },
      total: { calls: totalRow.calls, inputTokens: totalRow.input_tokens, outputTokens: totalRow.output_tokens },
    }
  },

  /** 최근 호출 N건, 사용자 이름 LEFT JOIN 포함(탈퇴/리셋된 사용자는 user_name이 null). */
  recent(limit = 20): AiUsageRecord[] {
    const rows = getDb()
      .prepare(
        `SELECT u.id, u.feature_key, u.user_id, users.name AS user_name, u.model,
                u.input_tokens, u.output_tokens, u.duration_ms, u.created_at
         FROM ai_usage u
         LEFT JOIN users ON users.id = u.user_id
         ORDER BY u.id DESC
         LIMIT ?`
      )
      .all(limit) as AiUsageRecentRow[]
    return rows.map(toRecord)
  },
}
