<script setup lang="ts">
import type { AiAnswer, AiSearchStreamEvent, Book, ChatAction } from '#shared/types'

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
  (q) => {
    // 비로그인 상태에서는 스트림 엔드포인트를 아예 호출하지 않는다(requireUser 401을
    // 굳이 왕복시키지 않고, 대신 로그인 유도 카드만 보여준다). 키워드 검색 결과 자체는
    // public이라 index.vue 쪽 책 목록은 그대로 노출된다.
    if (!user.value) return
    runSearch(q)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  currentController?.abort()
})

async function runAction(action: ChatAction) {
  // 단발 검색에는 대화가 없어 reply(빠른 답장) 버튼은 의미가 없다 — navigate만 처리한다.
  if (action.type !== 'navigate') return
  await navigateTo(action.to)
}

/** 화면에 보여줄 액션: navigate만(서버가 reply를 섞어 보내도 단발 검색에선 숨긴다). */
const visibleActions = computed(() => (answer.value?.actions ?? []).filter((a) => a.type === 'navigate'))
/** 여러 줄 답변(추천 목록)은 블록만 가운데 두고 글줄은 왼쪽 정렬(QA #84). */
const multiLine = computed(() => (answer.value?.message ?? '').includes('\n'))

function goLogin() {
  void navigateTo('/login')
}
</script>

<template>
  <div class="panel accent ai">
    <template v-if="!user">
      <div class="ai-head">
        <i>책벗 · AI</i>
        <b>책벗의 추천</b>
        <span class="ai-q">"{{ query }}"</span>
      </div>
      <p class="ai-fallback">책벗 AI 검색은 로그인 후 이용할 수 있어요</p>
      <button type="button" class="btn primary" @click="goLogin">로그인하기</button>
    </template>

    <div v-else-if="loading && !streamText && !errorMessage && !answer" class="ai-loading" aria-busy="true">
      <!-- 서가 사이 통로를 따라 책벗이 걸어가는 장면(QA #79) -->
      <AiLibrarySearchLoader :activity="activity" />
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
      <p class="ai-message" :class="{ multi: multiLine }">{{ answer.message }}</p>
      <div v-if="answer.books.length" class="ai-books">
        <NuxtLink v-for="book in answer.books" :key="book.id" :to="`/books/${book.id}`" class="ai-book">
          <BookCoverImage :src="book.coverUrl" :alt="book.title" />
          <div>
            <div class="t">{{ book.title }}</div>
            <div class="a">{{ book.author }}</div>
          </div>
        </NuxtLink>
      </div>
      <div v-if="visibleActions.length" class="ai-actions">
        <button
          v-for="(action, i) in visibleActions"
          :key="i"
          type="button"
          class="btn"
          :class="{ primary: i === 0 }"
          @click="runAction(action)"
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
/* 결과 블록은 가운데 정렬(QA #84): 헤더·본문·책 카드·버튼 모두 중앙. */
.ai-head { display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; text-align: center; }
.ai-head b { font-family: var(--font-display); font-size: 16.5px; }
.ai-head i { font-style: normal; font-size: 11px; letter-spacing: 2px; color: var(--red); font-weight: 700; }
.ai-q { font-size: 13px; color: var(--sub); }
p { margin: 0 0 20px; font-size: 15px; line-height: 1.75; color: var(--text-2); max-width: 820px; }
.ai-books { display: flex; justify-content: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.ai-book { flex: 0 1 300px; min-width: 220px; display: flex; gap: 14px; align-items: center; border: 1px solid var(--line); background: var(--card-2); border-radius: 4px; padding: 13px 14px; cursor: pointer; color: inherit; }
.ai-book:hover { border-color: var(--line-hover); }
.ai-book :deep(.cv) { width: 54px; height: 78px; }
.ai-book .t { font-weight: 700; font-size: 14.5px; margin-bottom: 2px; }
.ai-book .a { font-size: 12.5px; color: var(--sub); }
.ai-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }

.ai-loading { padding: 2px 0; min-height: 132px; }

.ai-fallback { margin: 0; font-size: 14px; color: var(--sub); }
.ai-message { white-space: pre-line; text-align: center; max-width: 720px; margin: 0 auto 18px; }
/* 여러 줄(추천 목록)은 블록만 가운데 두고 글줄은 왼쪽 정렬해 읽기 쉽게 */
.ai-message.multi { text-align: left; display: table; }

@media (max-width: 640px) {
  .ai-head { flex-wrap: wrap; gap: 6px 10px; }
  .ai-q { margin-left: 0; flex-basis: 100%; }
  .ai-book { min-width: 100%; }
  p { font-size: 14.5px; }
}
</style>
