/**
 * SSE(text/event-stream) 응답을 읽는 클라이언트 쪽 도구.
 *
 * `useApi()`의 `$fetch`는 응답 바디를 통째로 받아버려 스트리밍을 읽을 수 없다 — 그래서
 * 스트리밍 호출은 raw `fetch` + `ReadableStream`을 쓰고, 프레임 쪼개기·JSON 파싱은 여기
 * 한곳에 모아 AI 검색 패널과 책벗 채팅이 같은 코드를 쓴다.
 */

export interface SseParser<T> {
  /** 디코드된 청크를 먹이고, 그 청크에서 완성된 이벤트들을 순서대로 돌려준다. */
  feed(chunk: string): T[]
}

/** 프레임(빈 줄로 구분)이 청크 경계에 걸쳐도 완성될 때까지 버퍼에 들고 있는 상태기계. */
export function createSseParser<T>(): SseParser<T> {
  let buffer = ''

  return {
    feed(chunk: string): T[] {
      buffer += chunk
      const frames = buffer.split('\n\n')
      // 마지막 조각은 아직 완성되지 않은 프레임 — 다음 청크와 이어 붙인다.
      buffer = frames.pop() ?? ''

      const events: T[] = []
      for (const frame of frames) {
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
        if (!dataLine) continue
        try {
          events.push(JSON.parse(dataLine.slice('data: '.length)) as T)
        } catch {
          // 깨진 프레임 하나 때문에 남은 스트림을 버리진 않는다.
        }
      }
      return events
    },
  }
}

/**
 * 응답 바디를 끝까지 읽으며 이벤트마다 콜백을 부른다.
 * signal이 abort되면 조용히 멈춘다(패널 unmount·질문 교체 등 의도적인 중단).
 */
export async function readSseStream<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (ev: T) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser<T>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal?.aborted) break
    for (const ev of parser.feed(decoder.decode(value, { stream: true }))) {
      onEvent(ev)
    }
  }
}
