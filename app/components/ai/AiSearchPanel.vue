<script setup lang="ts">
import type { AiAnswer, Book } from '#shared/types'

const props = defineProps<{ query: string }>()

const api = useApi()

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const answer = ref<(AiAnswer & { books: Book[] }) | null>(null)

async function runSearch(q: string) {
  if (!q) return
  loading.value = true
  errorMessage.value = null
  answer.value = null
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

watch(
  () => props.query,
  (q) => runSearch(q),
  { immediate: true }
)

async function runAction(to: string) {
  await navigateTo(to)
}
</script>

<template>
  <div class="panel accent ai">
    <div v-if="loading" class="ai-loading" aria-busy="true">
      <svg class="wander-path" viewBox="0 0 410 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path d="M10,40 C60,10 90,70 140,40 S220,10 270,40 S350,70 400,40" />
      </svg>
      <span class="wander-label">책벗이 서가를 걷는 중...</span>
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

.ai-loading { display: flex; align-items: center; gap: 18px; padding: 4px 0; min-height: 46px; }
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
