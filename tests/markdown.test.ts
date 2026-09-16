import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../app/utils/markdown'

describe('renderMarkdown', () => {
  it('HTML을 먼저 이스케이프해 태그 주입을 막는다', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> & <b>bold</b>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&amp;')
  })

  it('**굵게** / *기울임* / `코드` / ~~취소~~ 를 태그로 바꾼다', () => {
    expect(renderMarkdown('**클린 코드**를 추천해요')).toContain('<strong>클린 코드</strong>')
    expect(renderMarkdown('*조용한* 카페')).toContain('<em>조용한</em>')
    expect(renderMarkdown('`npm run dev`')).toContain('<code>npm run dev</code>')
    expect(renderMarkdown('~~절판~~')).toContain('<del>절판</del>')
  })

  it('인라인 코드 안의 마크다운 기호는 그대로 둔다', () => {
    expect(renderMarkdown('`**not bold**`')).toContain('<code>**not bold**</code>')
  })

  it('- 목록을 ul/li로 바꾼다', () => {
    const html = renderMarkdown('- 첫째\n- 둘째')
    expect(html).toContain('<ul><li>첫째</li><li>둘째</li></ul>')
  })

  it('1. 목록을 ol/li로 바꾸고 시작 번호를 유지한다', () => {
    expect(renderMarkdown('1. 하나\n2. 둘')).toContain('<ol><li>하나</li><li>둘</li></ol>')
    expect(renderMarkdown('3. 셋')).toContain('<ol start="3"><li>셋</li></ol>')
  })

  it('#### 제목을 헤딩으로 바꾼다', () => {
    expect(renderMarkdown('## 추천 도서')).toContain('<h4>추천 도서</h4>')
  })

  it('빈 줄은 문단을, 한 줄 바꿈은 <br>을 만든다', () => {
    const html = renderMarkdown('첫 문단\n둘째 줄\n\n다음 문단')
    expect(html).toBe('<p>첫 문단<br>둘째 줄</p><p>다음 문단</p>')
  })

  it('안전한 링크만 a 태그로 만든다', () => {
    expect(renderMarkdown('[내 서재](/my)')).toContain('<a href="/my">내 서재</a>')
    expect(renderMarkdown('[지도](https://map.kakao.com/x)')).toContain(
      '<a href="https://map.kakao.com/x" target="_blank" rel="noopener noreferrer">지도</a>'
    )
  })

  it('javascript: 링크는 태그로 만들지 않는다', () => {
    const html = renderMarkdown('[누르지마](javascript:alert(1))')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href')
  })

  it('> 인용과 --- 구분선을 처리한다', () => {
    expect(renderMarkdown('> 조용해서 좋아요')).toContain('<blockquote>조용해서 좋아요</blockquote>')
    expect(renderMarkdown('---')).toContain('<hr>')
  })

  it('``` 코드 블록 안은 원문 그대로 보존한다', () => {
    const html = renderMarkdown('```\n- 목록 아님\n**굵게 아님**\n```')
    expect(html).toContain('<pre><code>- 목록 아님\n**굵게 아님**</code></pre>')
  })

  it('빈 입력은 빈 문자열', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n  ')).toBe('')
  })

  it('스트리밍 중 아직 닫히지 않은 ** 는 원문 그대로 남긴다', () => {
    expect(renderMarkdown('**클린 코')).toContain('**클린 코')
  })
})
