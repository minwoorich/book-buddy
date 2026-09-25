import { describe, it, expect } from 'vitest'
import { joinWindowOpen, hasSeat, reservedCount } from '../shared/utils/clubOpen'

const NOW = new Date('2026-09-25T00:00:00Z')
const m = (inviteStatus: 'accepted' | 'invited' | 'declined') => ({ inviteStatus })

describe('joinWindowOpen', () => {
  it('사람 모임 inviting은 열려 있다', () => {
    expect(joinWindowOpen({ origin: 'user', status: 'inviting', meetAt: null }, NOW)).toBe(true)
  })
  it('사람 모임 confirmed는 모임 KST 당일 전까지만', () => {
    expect(joinWindowOpen({ origin: 'user', status: 'confirmed', meetAt: '2026-09-29T09:30:00.000Z' }, NOW)).toBe(true)
    expect(joinWindowOpen({ origin: 'user', status: 'confirmed', meetAt: '2026-09-25T09:30:00.000Z' }, NOW)).toBe(false)
  })
  it('에이전트 모임·다른 상태는 닫혀 있다', () => {
    expect(joinWindowOpen({ origin: 'agent', status: 'inviting', meetAt: null }, NOW)).toBe(false)
    expect(joinWindowOpen({ origin: 'user', status: 'scheduling', meetAt: null }, NOW)).toBe(false)
  })
})

describe('hasSeat / reservedCount', () => {
  it('수락 + 초대 대기가 정원 미만이면 자리가 있다', () => {
    const club = { capacity: 3, members: [m('accepted'), m('invited'), m('declined')] }
    expect(reservedCount(club)).toBe(2)
    expect(hasSeat(club)).toBe(true)
    expect(hasSeat({ capacity: 2, members: [m('accepted'), m('invited')] })).toBe(false)
  })
})
