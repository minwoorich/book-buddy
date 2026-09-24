import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '../server/db/connection'
import { runAllDeadlines } from '../server/services/clubDeadlines'

beforeEach(() => { initDb(':memory:') })

describe('runAllDeadlines', () => {
  it('모집 만료 수를 포함한 전체 결과를 돌려준다', async () => {
    await expect(runAllDeadlines(new Date('2026-09-24T00:00:00Z'), { anthropicApiKey: '' })).resolves.toEqual({
      recruitExpired: 0, handled: 0, closed: 0, finished: 0, reminded: 0, remindedTomorrow: 0, reviewRequested: 0,
    })
  })
})
