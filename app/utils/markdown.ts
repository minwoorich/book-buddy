/**
 * 책벗 답변(message)에 쓰이는 마크다운을 읽기 좋은 HTML로 바꾼다.
 *
 * 외부 라이브러리(marked+DOMPurify) 대신 직접 쓴 이유는 "이스케이프 우선" 전략을 쓰기
 * 위해서다 — 원문을 통째로 HTML 이스케이프한 뒤 우리가 아는 문법만 태그로 되돌리므로,
 * 모델이 답변에 HTML을 흘리거나(사용자 입력을 그대로 인용하는 경우 포함) 이상한 링크를
 * 만들어도 태그가 살아날 틈이 없다. 지원 범위도 챗 말풍선에 필요한 만큼으로 좁힌다.
 *
 * 지원: 제목(#~###), 불릿·번호 목록, 인용(>), 구분선(---), 코드블록(```),
 *       굵게(**), 기울임(*·_), 인라인 코드(`), 취소선(~~), 링크([]()).
 *
 * 스트리밍 중에는 아직 닫히지 않은 기호(예: `**클린 코`)가 들어오는데, 짝이 맞지 않으면
 * 변환하지 않고 원문대로 두므로 타자기 표시에 그대로 써도 된다.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 링크 허용 목록. 앱 내부 경로(/…, #…)와 http(s)만 통과시킨다.
 * `javascript:`·`data:` 같은 스킴은 링크로 만들지 않고 원문 텍스트로 남긴다.
 */
function safeHref(href: string): string | null {
  const url = href.trim()
  if (/^(https?:\/\/)/i.test(url)) return url
  if (/^[/#]/.test(url)) return url
  return null
}

/** 이스케이프가 끝난 텍스트에 인라인 문법을 적용한다(인라인 코드는 이미 분리된 상태). */
function inlineEmphasis(text: string): string {
  return (
    text
      // 링크가 먼저다 — 라벨 안의 강조는 그 뒤에 처리된다.
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
        const safe = safeHref(href)
        if (!safe) return whole
        const external = /^https?:/i.test(safe)
        return external
          ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
          : `<a href="${safe}">${label}</a>`
      })
      .replace(/\*\*(?!\s)([^*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/~~(?!\s)([^~]+?)~~/g, '<del>$1</del>')
      // 남은 홑 별표/밑줄만 기울임으로. 밑줄은 단어 안(snake_case)에서는 건드리지 않는다.
      .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>')
  )
}

/** 한 줄(또는 문단)의 인라인 문법을 처리한다. 인라인 코드 안은 손대지 않는다. */
function inline(escaped: string): string {
  return escaped
    .split(/(`[^`\n]+`)/g)
    .map((part) =>
      part.length > 1 && part.startsWith('`') && part.endsWith('`')
        ? `<code>${part.slice(1, -1)}</code>`
        : inlineEmphasis(part)
    )
    .join('')
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const BULLET_RE = /^\s*[-*•]\s+(.*)$/
const ORDERED_RE = /^\s*(\d{1,3})[.)]\s+(.*)$/
// 이스케이프가 먼저라 인용 기호는 이 시점에 `&gt;`로 바뀌어 있다.
const QUOTE_RE = /^\s*&gt;\s?(.*)$/

/** 연속된 같은 종류의 줄을 하나의 블록으로 묶어 HTML로 바꾼다. */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return ''

  const lines = escapeHtml(source.replace(/\r\n?/g, '\n')).split('\n')
  const out: string[] = []
  let i = 0

  // 문단 버퍼 — 빈 줄이나 다른 블록을 만나면 <p>로 비운다.
  let para: string[] = []
  const flushParagraph = () => {
    if (para.length === 0) return
    out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // ``` 코드 블록: 닫힐 때까지(또는 끝까지) 원문 그대로.
    if (/^\s*```/.test(line)) {
      flushParagraph()
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '')
        i++
      }
      i++ // 닫는 ```
      out.push(`<pre><code>${body.join('\n')}</code></pre>`)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      i++
      continue
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph()
      out.push('<hr>')
      i++
      continue
    }

    const heading = line.match(HEADING_RE)
    if (heading) {
      flushParagraph()
      // 말풍선 안이라 h1~h3은 과하다 — 한 단계씩 낮춰 h3~h5로 쓴다.
      const level = Math.min(5, (heading[1]?.length ?? 1) + 2)
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`)
      i++
      continue
    }

    if (BULLET_RE.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length) {
        const m = (lines[i] ?? '').match(BULLET_RE)
        if (!m) break
        items.push(`<li>${inline(m[1] ?? '')}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    const ordered = line.match(ORDERED_RE)
    if (ordered) {
      flushParagraph()
      // 모델이 "3. "부터 시작하는 조각을 낼 수도 있으니 첫 번호를 그대로 살린다.
      const start = Number(ordered[1])
      const items: string[] = []
      while (i < lines.length) {
        const m = (lines[i] ?? '').match(ORDERED_RE)
        if (!m) break
        items.push(`<li>${inline(m[2] ?? '')}</li>`)
        i++
      }
      out.push(`<ol${start === 1 ? '' : ` start="${start}"`}>${items.join('')}</ol>`)
      continue
    }

    const quote = line.match(QUOTE_RE)
    if (quote) {
      flushParagraph()
      const body: string[] = []
      while (i < lines.length) {
        const m = (lines[i] ?? '').match(QUOTE_RE)
        if (!m) break
        body.push(inline(m[1] ?? ''))
        i++
      }
      out.push(`<blockquote>${body.join('<br>')}</blockquote>`)
      continue
    }

    para.push(line)
    i++
  }

  flushParagraph()
  return out.join('')
}
