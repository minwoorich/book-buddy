import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * v-html="식별자"로 넣는 값이 <script setup>에 선언돼 있는지 확인한다.
 * 선언이 없으면 Vue는 조용히 빈 값을 렌더해서(콘솔 경고만) 본문 텍스트만 사라진다 —
 * AiSearchPanel의 renderedAnswer/renderedStream 누락 사고를 다시 막기 위한 가드.
 */
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

function relative(path: string): string {
  return path.slice(process.cwd().length).split('\\').join('/')
}

describe('v-html 바인딩', () => {
  const files = vueFiles(join(process.cwd(), 'app'))

  it('.vue 파일을 찾는다', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    // 단순 식별자만 검사한다(표현식·옵셔널 체이닝 등은 대상 아님).
    const names = [...source.matchAll(/v-html="([A-Za-z_$][\w$]*)"/g)].map((m) => m[1] as string)
    if (names.length === 0) continue

    const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''

    it.each([...new Set(names)])(`${relative(file)} — %s 가 선언돼 있다`, (name) => {
      expect(script).toMatch(new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`))
    })
  }
})
