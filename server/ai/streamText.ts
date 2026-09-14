// LLM이 스트리밍으로 흘려보내는 원문 텍스트(최종적으로는
// `{"message":"...", "bookIds":[...], "actions":[...]}` 형태의 JSON이 됨) 조각들을
// 실시간으로 먹으면서, "message" 필드의 문자열 값 내부 문자만 델타로 뽑아내는 상태기계.
//
// 완전한 JSON 파서가 아니다 — message 필드가 스트리밍 도중엔 아직 닫히지 않은 미완성
// JSON이라 파서를 돌릴 수 없기 때문에, "message" 토큰 → `:` → 여는 `"` → (이스케이프
// 처리하며) 본문 수집 → 닫는 `"` 순서만 따라가는 단순 상태기계로 충분하다. 최종 신뢰
// 소스는 스트림이 끝난 뒤 누적 텍스트 전체를 기존 parseAiAnswer로 다시 파싱한 결과이고,
// 이 추출기는 오직 "타자기처럼 보여줄 중간 델타"만 책임진다.

type Phase = 'seek-key' | 'seek-colon' | 'seek-quote' | 'in-string' | 'done'

const KEY_TOKEN = '"message"'

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
  // seek-key 단계에서만 쓰는, "message" 토큰이 청크 경계에 걸쳐도 찾을 수 있게 하는
  // 꼬리 버퍼. 토큰 길이보다 넉넉히만 유지하면 된다.
  let tail = ''
  let escapeNext = false

  function feed(chunk: string): string {
    if (phase === 'done') return ''

    let out = ''

    for (const ch of chunk) {
      if (phase === 'seek-key') {
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
