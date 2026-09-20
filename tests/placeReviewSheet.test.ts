import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 장소 후기 보기의 배치 가드.
 *
 * 예전에는 목록 카드 안에 후기가 통째로 붙어 있었다 — 카드가 길어져 PC 목록(560px 스크롤 칸)에는
 * 두세 장밖에 안 들어갔고, 모바일은 지도 아래로 페이지가 한없이 늘어났다. 전체 후기는 시트로
 * 옮기고 카드에는 한 줄 신호만 남겼는데, 그 "한 줄"과 "시트 안에서만 스크롤"이 깨지면
 * 곧바로 예전 문제로 되돌아간다.
 */
function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const sheet = source('app/components/reading/PlaceReviewSheet.vue')
const panel = source('app/components/reading/PlaceReviewPanel.vue')
const card = source('app/components/reading/PlaceSummaryCard.vue')

/** `.name { ... }` 한 벌의 선언부만 뽑는다(스코프드 스타일 기준). */
function rule(css: string, selector: string): string {
  const match = css.match(new RegExp(String.raw`\n\.${selector}\s*\{([^}]*)\}`))
  expect(match, `.${selector} 규칙을 찾지 못했다`).not.toBeNull()
  return match![1] as string
}

/** `.a, .b { ... }`처럼 묶인 규칙까지 포함해, 그 클래스에 걸리는 선언부를 모두 합친다. */
function declarationsFor(css: string, className: string): string {
  const found = [...css.matchAll(/\n([^{}\n][^{}]*)\{([^}]*)\}/g)]
    .filter(([, selectors]) => new RegExp(String.raw`(^|,|\s)\.${className}(\s|,|$)`).test(selectors!))
    .map(([, , body]) => body)
  expect(found.length, `.${className}에 걸리는 규칙을 찾지 못했다`).toBeGreaterThan(0)
  return found.join(' ')
}

/** `@media (max-width: 640px)` 블록 안쪽만 잘라낸다. */
function mobileBlock(css: string): string {
  const at = css.indexOf('@media (max-width: 640px)')
  expect(at, '모바일 미디어 쿼리를 찾지 못했다').toBeGreaterThan(-1)
  return css.slice(at)
}

describe('PlaceReviewSheet 세로 배치', () => {
  it('머리와 탭 줄은 줄어들지 않는다', () => {
    expect(rule(sheet, 'head')).toMatch(/flex:\s*none/)
    expect(rule(sheet, 'tabs')).toMatch(/flex:\s*none/)
  })

  it('본문이 남는 높이를 받아 그 안에서만 스크롤한다', () => {
    const body = rule(sheet, 'body')
    expect(body).toMatch(/flex:\s*1/)
    expect(body).toMatch(/min-height:\s*0/)
    expect(body).toMatch(/overflow-y:\s*auto/)
  })

  it('후기 쓰기 폼도 시트 안에서만 스크롤한다(폼이 길어도 시트가 화면을 넘지 않게)', () => {
    const form = rule(sheet, 'form')
    expect(form).toMatch(/min-height:\s*0/)
    expect(form).toMatch(/overflow-y:\s*auto/)
  })

  it('모바일에서는 바텀시트로 붙는다', () => {
    const mobile = mobileBlock(sheet)
    expect(mobile).toMatch(/\.modal-back\s*\{[^}]*align-items:\s*flex-end/)
    expect(mobile).toMatch(/\.sheet\s*\{[^}]*border-radius:\s*12px 12px 0 0/)
  })

  it('사진 그리드는 PC 3열, 좁은 화면 2열 — 3열이면 사진이 너무 작아진다', () => {
    expect(rule(sheet, 'grid')).toMatch(/grid-template-columns:\s*repeat\(3, 1fr\)/)
    expect(mobileBlock(sheet)).toMatch(/\.grid\s*\{[^}]*repeat\(2, 1fr\)/)
  })

  it('라이트박스는 시트(z-index 95)보다 위에 겹친다', () => {
    const lb = rule(sheet, 'lb')
    const z = Number(lb.match(/z-index:\s*(\d+)/)?.[1])
    expect(z).toBeGreaterThan(95)
  })
})

describe('PlaceReviewSheet 동작', () => {
  it('Esc는 라이트박스를 먼저 닫고, 그때 시트는 닫지 않는다', () => {
    // 두 겹이 한 번에 사라지면 사진을 보다 실수로 시트까지 잃는다.
    const handler = sheet.match(/function onKeydown\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(handler).toMatch(/if \(lightbox\.value !== null\)/)
    expect(handler).toMatch(/return/)
    const afterReturn = handler.slice(handler.indexOf('return'))
    expect(afterReturn).toMatch(/emit\('close'\)/)
  })

  it('저장·삭제 뒤 시트와 부모 요약을 함께 새로 맞춘다', () => {
    const sync = sheet.match(/async function syncAfterWrite\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(sync).toMatch(/await load\(\)/)
    expect(sync).toMatch(/emit\('changed'/)
  })

  it('미리보기 objectURL은 떼어낼 때·언마운트할 때 해제한다(메모리 누수 방지)', () => {
    expect(sheet).toMatch(/revokeObjectURL/)
    expect(sheet).toMatch(/onUnmounted\(\(\) => \{[\s\S]*revokeNewImages\(\)/)
  })

  it('저장은 multipart로 보내고 남길 기존 사진을 함께 알린다', () => {
    expect(sheet).toMatch(/new FormData\(\)/)
    expect(sheet).toMatch(/body\.append\('keepImages', JSON\.stringify\(keepImages\.value\)\)/)
    expect(sheet).toMatch(/body\.append\('image', img\.file\)/)
  })
})

describe('PlaceReviewPanel 한 줄 요약', () => {
  it('최근 코멘트는 딱 한 줄로 잘린다 — 카드 높이가 후기 길이에 휘둘리면 안 된다', () => {
    const decls = declarationsFor(panel, 'say')
    expect(decls).toMatch(/white-space:\s*nowrap/)
    expect(decls).toMatch(/overflow:\s*hidden/)
    expect(decls).toMatch(/text-overflow:\s*ellipsis/)
  })

  it('태그 줄은 접히지 않는다 — 태그가 늘어도 카드가 두 줄로 커지면 안 된다', () => {
    expect(declarationsFor(panel, 'tally')).toMatch(/flex-wrap:\s*nowrap/)
  })

  it('카드 안에는 후기 작성 폼이 없다(시트로 옮겼다)', () => {
    expect(panel).not.toMatch(/prv-form|type="file"|FormData/)
  })

  it('요약 줄 전체가 시트를 여는 버튼이다', () => {
    const tag = panel.match(/<button[\s\S]{0,160}?class="prv-line"[\s\S]{0,160}?>/)?.[0] ?? ''
    expect(tag).toMatch(/@click="\$emit\('open'\)"/)
  })

  it('사진 수는 썸네일 위 배지가 아니라 글로 적는다', () => {
    expect(panel).toMatch(/사진 \{\{ photoCount \}\}/)
    expect(panel).not.toMatch(/position:\s*absolute/)
  })
})

describe('태그 배지', () => {
  const css = source('app/assets/css/main.css')

  it('배지는 알약이 아니라 각진 직사각형에 연한 빨강 바탕이다', () => {
    const badge = rule(css, 'tag-badge')
    expect(badge).toMatch(/border-radius:\s*3px/)
    expect(badge).toMatch(/background:\s*var\(--red-tint\)/)
  })

  it('자리가 모자라면 배지가 통째로 잘리는 대신 제 글자를 줄인다', () => {
    // 예전엔 컨테이너가 칩 한가운데를 잘라 "채…"처럼 깨져 보였다. 배지가 스스로 줄어야
    // 넘치는 지점이 배지 안쪽 말줄임으로 정리된다.
    const badge = rule(css, 'tag-badge')
    expect(badge).toMatch(/min-width:\s*0/)
    expect(badge).toMatch(/white-space:\s*nowrap/)
    expect(badge).toMatch(/text-overflow:\s*ellipsis/)
  })

  it.each([
    ['PlaceReviewSheet', sheet],
    ['PlaceReviewPanel', panel],
    ['PlaceSummaryCard', card],
  ])('%s는 전역 페이지 컨테이너 클래스 `wrap`을 안쪽 요소에 쓰지 않는다', (_name, css) => {
    // `.wrap`은 페이지 바깥 틀(padding: 40px 24px 90px)이다. 배지 줄에 수식 클래스로 붙였다가
    // 줄마다 위 40px·아래 90px 빈 띠가 생기고 왼쪽으로 24px 밀렸다.
    const classAttrs = [...css.matchAll(/class="([^"]*)"/g)].map((m) => m[1]!)
    expect(classAttrs.filter((v) => v.split(/\s+/).includes('wrap'))).toEqual([])
  })

  it('태그 6종 모두 이모지를 가진다 — 라벨은 AI 프롬프트에도 쓰이므로 섞지 않는다', () => {
    const tags = source('shared/constants/placeTags.ts')
    const emojis = [...tags.matchAll(/emoji:\s*'([^']+)'/g)].map((m) => m[1])
    expect(emojis).toHaveLength(6)
    expect(new Set(emojis).size).toBe(6)
    expect(tags).not.toMatch(/label:\s*'[^']*[\u{1F300}-\u{1FAFF}]/u)
  })
})

describe('에디토리얼 톤 유지', () => {
  // 이 앱은 책 리뷰 목록(ReviewList)처럼 채움 없는 구분선 톤이다. 알약(999px)·분홍 채움 카드·
  // 사진 위 그라데이션 덮개가 다시 들어오면 이 화면만 혼자 튄다.
  // 태그 배지의 연한 빨강 바탕은 예외인데, 그건 전역 `.tag-badge`(main.css)에 한 번만 있다 —
  // 컴포넌트 스코프에 또 칠하기 시작하면 그때부터 알록달록해진다.
  // (지도 핀 번호 배지 `.head .no`의 --red 바탕도 핀과 짝을 맞추는 것이라 예외다.)
  it.each([
    ['PlaceReviewSheet', sheet],
    ['PlaceReviewPanel', panel],
    ['PlaceSummaryCard', card],
  ])('%s의 스코프드 스타일에 알약·분홍 채움·그라데이션 덮개가 없다', (_name, css) => {
    const styles = css.slice(css.indexOf('<style'))
    expect(styles).not.toMatch(/border-radius:\s*999px/)
    expect(styles).not.toMatch(/linear-gradient/)
    expect(styles).not.toMatch(/background:\s*var\(--red-tint\)/)
  })
})

describe('PlaceSummaryCard 후기 진입점', () => {
  it('지도 요약 카드에서 바로 후기 시트를 연다 — 목록으로 내려가지 않는다', () => {
    expect(card).toMatch(/@click="\$emit\('reviews'\)"/)
    expect(card).toMatch(/defineEmits<\{[^}]*reviews:\s*\[\]/)
  })

  it('후기가 없는 장소에서도 첫 후기를 남기러 들어갈 수 있다', () => {
    expect(card).toMatch(/첫 후기 남기기/)
  })
})
