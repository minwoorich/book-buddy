/**
 * 답변 본문이 장소 이름을 실제로 불렀는지 판정한다.
 *
 * 근거 패널(placeEvidence)과 지도 마킹(placeCollector)이 같은 곳을 가리켜야 하므로 —
 * 버튼에 뜬 후기의 장소와 지도에 찍힌 핀이 어긋나면 사용자는 둘 중 뭘 믿어야 할지 모른다 —
 * 판정 규칙은 이 한 곳에만 둔다.
 */

/** "커피베이 동탄점"과 "커피베이동탄점"을 같게 보기 위한 정규화. */
function squash(s: string): string {
  return s.replace(/\s+/g, '')
}

/** 여러 이름을 같은 본문에 대고 볼 때 본문 정규화를 한 번만 하도록 테스터를 만들어 준다. */
export function createMentionTest(answerText: string): (name: string) => boolean {
  const text = squash(answerText)
  return (name: string) => text.includes(squash(name))
}
