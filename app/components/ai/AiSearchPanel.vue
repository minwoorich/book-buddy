<script setup lang="ts">
import type { AiAnswer, AiSearchStreamEvent, Book } from '#shared/types'

const props = defineProps<{ query: string }>()

const api = useApi()
const { user } = useCurrentUser()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const answer = ref<(AiAnswer & { books: Book[] }) | null>(null)
/** 스트리밍 중 가장 최근 tool 이벤트가 남긴 짧은 한국어 활동 라벨. */
const activity = ref('')
/** 스트리밍 중 누적되는 최종 답변 message 평문(타자기 효과용). */
const streamText = ref('')

let currentController: AbortController | null = null

const TOOL_LABELS: Record<string, string> = {
  search_books: '서가를 뒤지는 중',
  get_book_detail: '책 정보를 읽는 중',
  get_reviews: '동료 리뷰 확인 중',
  get_my_loans: '대출 이력 살피는 중',
  search_external_books: '외부 서점 검색 중',
  borrow_book: '요청 처리 중',
  return_book: '요청 처리 중',
  reserve_book: '요청 처리 중',
  request_purchase: '요청 처리 중',
  add_wishlist: '요청 처리 중',
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? '요청 처리 중'
}

function resetState() {
  errorMessage.value = null
  answer.value = null
  activity.value = ''
  streamText.value = ''
}

/** 스트리밍 실패(연결 실패/비200) 시 기존 비스트리밍 엔드포인트로 재시도한다. */
async function runSearchFallback(q: string) {
  try {
    answer.value = await api<AiAnswer & { books: Book[] }>('/api/ai/search', {
      method: 'POST',
      body: { query: q },
    })
  } catch (e) {
    errorMessage.value = apiErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function runSearch(q: string) {
  if (!q) return

  currentController?.abort()
  const controller = new AbortController()
  currentController = controller

  loading.value = true
  resetState()

  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (user.value) headers['x-user-id'] = String(user.value.id)

    const res = await fetch('/api/ai/search-stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: q }),
      signal: controller.signal,
    })

    if (!res.ok || !res.body) {
      await runSearchFallback(q)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (controller.signal.aborted) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const dataLine = part.split('\n').find((l) => l.startsWith('data: '))
        if (!dataLine) continue

        let ev: AiSearchStreamEvent
        try {
          ev = JSON.parse(dataLine.slice('data: '.length))
        } catch {
          continue
        }

        if (ev.type === 'tool') {
          activity.value = toolLabel(ev.name)
        } else if (ev.type === 'delta') {
          streamText.value += ev.text
        } else if (ev.type === 'done') {
          answer.value = { ...ev.answer, books: ev.books }
          loading.value = false
        } else if (ev.type === 'error') {
          errorMessage.value = ev.message
          loading.value = false
        }
      }
    }
  } catch (e) {
    if (controller.signal.aborted) return // unmount/query 변경으로 의도적으로 끊은 경우
    await runSearchFallback(q)
    return
  } finally {
    if (currentController === controller) loading.value = false
  }
}

watch(
  () => props.query,
  (q) => runSearch(q),
  { immediate: true }
)

onBeforeUnmount(() => {
  currentController?.abort()
})

async function runAction(to: string) {
  await navigateTo(to)
}
</script>

<template>
  <div class="panel accent ai">
    <div v-if="loading && !streamText && !errorMessage && !answer" class="ai-loading" aria-busy="true">
      <div class="ai-loading-row">
        <svg class="wander-path" viewBox="0 0 410 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path d="M10,40 C60,10 90,70 140,40 S220,10 270,40 S350,70 400,40" />
        </svg>
        <span class="wander-label">책벗이 서가를 걷는 중...</span>
      </div>
      <span v-if="activity" class="ai-activity">{{ activity }}</span>
    </div>

    <template v-else-if="errorMessage">
      <div class="ai-head">
        <i>책벗 · AI</i>
        <b>책벗의 추천</b>
        <span class="ai-q">"{{ query }}"</span>
      </div>
      <p class="ai-fallback">{{ errorMessage }}</p>
    </template>

    <template v-else-if="answer">
      <div class="ai-head">
        <i>책벗 · AI</i>
        <b>책벗의 추천</b>
        <span class="ai-q">"{{ query }}"</span>
      </div>
      <p class="ai-message">{{ answer.message }}</p>
      <div v-if="answer.books.length" class="ai-books">
        <NuxtLink v-for="book in answer.books" :key="book.id" :to="`/books/${book.id}`" class="ai-book">
          <BookCoverImage :src="book.coverUrl" :alt="book.title" />
          <div>
            <div class="t">{{ book.title }}</div>
            <div class="a">{{ book.author }}</div>
          </div>
        </NuxtLink>
      </div>
      <div v-if="answer.actions.length" class="ai-actions">
        <button
          v-for="(action, i) in answer.actions"
          :key="i"
          type="button"
          class="btn"
          :class="{ primary: i === 0 }"
          @click="runAction(action.to)"
        >{{ action.label }}</button>
      </div>
    </template>

    <template v-else-if="streamText">
      <div class="ai-head">
        <i>책벗 · AI</i>
        <b>책벗의 추천</b>
        <span class="ai-q">"{{ query }}"</span>
      </div>
      <p class="ai-message">{{ streamText }}</p>
    </template>
  </div>
</template>

<style scoped>
.ai-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.ai-head b { font-family: "Noto Serif KR", serif; font-size: 16.5px; }
.ai-head i { font-style: normal; font-size: 11px; letter-spacing: 2px; color: var(--red); font-weight: 700; }
.ai-q { font-size: 13px; color: var(--sub); margin-left: auto; }
p { margin: 0 0 20px; font-size: 15px; line-height: 1.75; color: #464034; max-width: 820px; }
.ai-books { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.ai-book { flex: 1; min-width: 220px; display: flex; gap: 14px; align-items: center; border: 1px solid var(--line); background: var(--card-2); border-radius: 4px; padding: 13px 14px; cursor: pointer; color: inherit; }
.ai-book:hover { border-color: #C9BCA2; }
.ai-book :deep(.cv) { width: 54px; height: 78px; }
.ai-book .t { font-weight: 700; font-size: 14.5px; margin-bottom: 2px; }
.ai-book .a { font-size: 12.5px; color: var(--sub); }
.ai-actions { display: flex; gap: 10px; flex-wrap: wrap; }

.ai-loading { padding: 4px 0; min-height: 46px; }
.ai-loading-row { display: flex; align-items: center; gap: 18px; }
.ai-activity { display: block; margin: 6px 0 0 4px; font-size: 12.5px; color: var(--sub); }
.wander-path { width: 230px; height: 46px; flex-shrink: 0; }
.wander-path path {
  fill: none;
  stroke: var(--red);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 700;
  animation: wander 2.4s ease-in-out infinite;
}
.wander-label { font-size: 14px; color: var(--sub); }
@keyframes wander {
  0% { stroke-dashoffset: 700; }
  45%, 55% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -700; }
}

.ai-fallback { margin: 0; font-size: 14px; color: var(--sub); }
.ai-message { white-space: pre-line; }
</style>
