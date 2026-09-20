import { describe, expect, it } from 'vitest'
import { scrollTopFor } from '../app/utils/scrollWithin'

/**
 * 지도 핀을 눌렀을 때 목록을 움직이는 계산. scrollIntoView는 창(window)까지 같이 끌고 가서
 * 모바일에서 페이지가 맨 아래로 내려갔다 — 목록 컨테이너 안에서만 움직이도록 직접 계산한다.
 */

const view = { viewTop: 100, viewHeight: 400, margin: 12 }

describe('scrollTopFor', () => {
  it('이미 다 보이는 항목이면 움직이지 않는다', () => {
    expect(scrollTopFor({ ...view, itemTop: 150, itemHeight: 80 })).toBeNull()
  })

  it('위로 벗어난 항목은 위쪽 여백만큼 띄워 보여준다', () => {
    expect(scrollTopFor({ ...view, itemTop: 40, itemHeight: 80 })).toBe(28)
  })

  it('아래로 벗어난 항목은 아래 끝에 여백을 두고 맞춘다', () => {
    // 항목 끝 620 + 여백 12 - 높이 400 = 232
    expect(scrollTopFor({ ...view, itemTop: 540, itemHeight: 80 })).toBe(232)
  })

  it('화면보다 큰 항목은 시작 부분이 보이게 맞춘다', () => {
    expect(scrollTopFor({ ...view, itemTop: 300, itemHeight: 900 })).toBe(288)
  })

  it('맨 위 항목에서 음수로 내려가지 않는다', () => {
    expect(scrollTopFor({ viewTop: 5, viewHeight: 400, margin: 12, itemTop: 0, itemHeight: 80 })).toBe(0)
  })
})
