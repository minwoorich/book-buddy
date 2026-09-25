import { describe, it, expect, beforeEach } from 'vitest'
import { clubStream } from '../server/utils/clubStream'
import type { ClubMessage } from '../shared/types'

const msg = (id: number): ClubMessage => ({ id, clubId: 1, userId: 9, userName: 'x', department: 'd', kind: 'chat', body: 'b', createdAt: '2026-09-25 00:00:00' })

beforeEach(() => { clubStream.reset() })

describe('clubStream', () => {
  it('구독자에게만 발행되고 해제하면 더 안 온다', () => {
    const got: number[] = []; const other: number[] = []
    const off = clubStream.subscribe(1, 10, (m) => got.push(m.id))
    clubStream.subscribe(2, 11, (m) => other.push(m.id))
    clubStream.publish(1, msg(1))
    off()
    clubStream.publish(1, msg(2))
    expect(got).toEqual([1]); expect(other).toEqual([])
  })
  it('onlineUserIds는 붙어 있는 사람만', () => {
    const off = clubStream.subscribe(1, 10, () => {})
    clubStream.subscribe(1, 12, () => {})
    expect([...clubStream.onlineUserIds(1)].sort()).toEqual([10, 12])
    off()
    expect([...clubStream.onlineUserIds(1)]).toEqual([12])
    expect(clubStream.onlineUserIds(99).size).toBe(0)
  })
  it('한 구독자가 던져도 나머지는 받는다', () => {
    const got: number[] = []
    clubStream.subscribe(1, 10, () => { throw new Error('boom') })
    clubStream.subscribe(1, 11, (m) => got.push(m.id))
    expect(() => clubStream.publish(1, msg(1))).not.toThrow()
    expect(got).toEqual([1])
  })
})
