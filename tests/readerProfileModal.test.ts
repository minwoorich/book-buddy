import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 랭킹에서 사람을 누르면 뜨는 독서 프로필 모달의 세로 배치 가드.
 *
 * .sheet는 max-height가 걸린 flex 컬럼이라, 완독 목록이 길면 flex 항목이 기본값(shrink: 1)대로
 * 모두 눌린다 — 모바일에서 "완독한 책 / 남긴 리뷰" 탭 줄이 잘리거나 아예 안 보였다.
 * 머리·탭은 flex: none으로 고정하고, 목록만 남는 높이를 받아(min-height: 0) 스크롤해야 한다.
 */

const source = readFileSync(join(process.cwd(), 'app/components/reading/ReaderProfileModal.vue'), 'utf8')

/** `.list { ... }` 처럼 클래스 한 벌의 선언부만 뽑는다(스코프드 스타일 기준). */
function rule(className: string): string {
  const match = source.match(new RegExp(String.raw`\n\.${className}\s*\{([^}]*)\}`))
  expect(match, `.${className} 규칙을 찾지 못했다`).not.toBeNull()
  return match![1] as string
}

describe('ReaderProfileModal 세로 배치', () => {
  it('머리와 탭 줄은 줄어들지 않는다', () => {
    expect(rule('who')).toMatch(/flex:\s*none/)
    expect(rule('tabs')).toMatch(/flex:\s*none/)
  })

  it('목록이 남는 높이를 받아 그 안에서 스크롤한다', () => {
    const list = rule('list')
    expect(list).toMatch(/flex:\s*1/)
    expect(list).toMatch(/min-height:\s*0/)
    expect(list).toMatch(/overflow-y:\s*auto/)
  })
})
