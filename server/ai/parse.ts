import type { AiAnswer, ChatAction } from '../../shared/types'

/**
 * text 안에서 첫 `{`부터 시작하는, 문자열 리터럴을 고려해 중괄호 깊이가 균형을 이루는
 * 첫 JSON 블록을 추출한다. 코드펜스(```json ... ```)로 감싸져 있어도 펜스 문자는 `{`가
 * 아니므로 그대로 통과한다. 균형이 맞는 블록을 찾지 못하면 null.
 */
function extractJsonBlock(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

function toBookIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}

function isChatAction(value: unknown): value is ChatAction {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    v.type === 'navigate' &&
    typeof v.label === 'string' &&
    v.label.length > 0 &&
    typeof v.to === 'string' &&
    v.to.length > 0
  )
}

function toActions(value: unknown): ChatAction[] {
  if (!Array.isArray(value)) return []
  return value.filter(isChatAction)
}

/**
 * LLM 최종 응답 텍스트에서 AiAnswer JSON을 파싱한다. 코드펜스로 감싸져 있거나 앞뒤에
 * 잡담이 섞여 있어도 첫 균형 JSON 블록을 찾아 파싱을 시도한다. 블록이 없거나, JSON
 * 파싱에 실패하거나, message 필드가 없으면 원문 텍스트를 그대로 message로 담은 폴백을
 * 반환한다(절대 throw하지 않는다).
 */
export function parseAiAnswer(text: string): AiAnswer {
  const fallback: AiAnswer = { message: text.trim(), bookIds: [], actions: [] }

  const block = extractJsonBlock(text)
  if (!block) return fallback

  try {
    const parsed = JSON.parse(block) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.message !== 'string') {
      return fallback
    }
    return {
      message: parsed.message,
      bookIds: toBookIds(parsed.bookIds),
      actions: toActions(parsed.actions),
    }
  } catch {
    return fallback
  }
}
