// LLM이 스트리밍으로 흘려보내는 원문 텍스트(최종적으로는
// `{"message":"...", "bookIds":[...], "actions":[...]}` 형태의 JSON이 됨) 조각들을
// 실시간으로 먹으면서, "message" 필드의 문자열 값 내부 문자만 델타로 뽑아내는 상태기계.
//
// 완전한 JSON 파서가 아니다 — message 필드가 스트리밍 도중엔 아직 닫히지 않은 미완성
// JSON이라 파서를 돌릴 수 없기 때문에, "message" 토큰 → `:` → 여는 `"` → (이스케이프
// 처리하며) 본문 수집 → 닫는 `"` 순서만 따라가는 단순 상태기계로 충분하다. 최종 신뢰
// 소스는 스트림이 끝난 뒤 누적 텍스트 전체를 기존 parseAiAnswer로 다시 파싱한 결과이고,
// 이 추출기는 오직 "타자기처럼 보여줄 중간 델타"만 책임진다.

type Phase = 'seek-key' | 'seek-colon' | 'seek-quote' | 'in-string' | 'raw' | 'done'

const KEY_TOKEN = '"message"'

/**
 * 프롬프트가 JSON을 요구해도 모델은 가끔 평문으로 답한다(그래서 enrich.ts가 존재한다).
 * 그런 턴에서 아무것도 흘리지 않으면 사용자는 끝날 때까지 로더만 보게 되므로, `{`가
 * 한 번도 안 나온 채 이만큼 쌓이면 "이 턴은 평문"으로 보고 원문을 그대로 흘린다.
 * 서론("물론이죠, 찾아볼게요.
```json
{...}") 뒤에 JSON이 오는 경우를 평문으로
 * 오해하지 않을 만큼은 넉넉해야 해서 한 문장 남짓으로 잡았다.
 */
const PLAIN_TEXT_THRESHOLD = 60

function unescapeChar(ch: string): string {
  switch (ch) {
    case 'n':
      return '\n'
    case 't':
      return '\t'
    case 'r':
      return '\r'
    case '"':
      return '"'
    case '\\':
      return '\\'
    case '/':
      return '/'
    default:
      return ch
  }
}

export interface MessageExtractor {
  /** 새 청크를 먹이고, 그 청크에서 새로 확정된 message 평문(없으면 '')을 반환한다. */
  feed(chunk: string): string
}

/** 상태를 가진 새 추출기 인스턴스를 만든다. LLM 응답 1건당 하나씩 사용한다. */
export function createMessageExtractor(): MessageExtractor {
  let phase: Phase = 'seek-key'
  // 평문 판정용: JSON이 시작되기 전까지 본 원문과, `{`를 한 번이라도 봤는지.
  let preamble = ''
  let sawBrace = false
  // seek-key 단계에서만 쓰는, "message" 토큰이 청크 경계에 걸쳐도 찾을 수 있게 하는
  // 꼬리 버퍼. 토큰 길이보다 넉넉히만 유지하면 된다.
  let tail = ''
  let escapeNext = false

  function feed(chunk: string): string {
    if (phase === 'done') return ''
    if (phase === 'raw') return chunk

    let out = ''

    // 인덱스가 필요하다 — 평문으로 판정되는 순간 "이 청크의 남은 부분"까지 한 번에 흘린다.
    const chars = Array.from(chunk)
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i] as string
      if (phase === 'seek-key') {
        if (ch === '{') sawBrace = true
        if (!sawBrace) {
          preamble += ch
          if (preamble.length >= PLAIN_TEXT_THRESHOLD) {
            // 여기까지 `{`가 없었다 — 이 턴은 평문이다. 지금까지 본 원문과 남은 청크를 그대로.
            phase = 'raw'
            return out + preamble + chars.slice(i + 1).join('')
          }
        }
        tail += ch
        if (tail.length > KEY_TOKEN.length + 4) {
          tail = tail.slice(-(KEY_TOKEN.length + 4))
        }
        if (tail.endsWith(KEY_TOKEN)) {
          phase = 'seek-colon'
          tail = ''
        }
        continue
      }

      if (phase === 'seek-colon') {
        if (ch === ':') phase = 'seek-quote'
        continue
      }

      if (phase === 'seek-quote') {
        if (ch === '"') phase = 'in-string'
        continue
      }

      // phase === 'in-string'
      if (escapeNext) {
        out += unescapeChar(ch)
        escapeNext = false
        continue
      }
      if (ch === '\\') {
        escapeNext = true
        continue
      }
      if (ch === '"') {
        phase = 'done'
        break
      }
      out += ch
    }

    return out
  }

  return { feed }
}
