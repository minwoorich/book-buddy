<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

/** 검색창 안내 문구 — 5초마다 순환 (QA #51, 전호연) */
const PLACEHOLDERS = [
  '지금의 나는 지금까지 내가 읽은 책의 총합이다',
  '알고 싶은 주제나 삶에 대한 질문이 분명하면, 길은 어렵지 않다',
  '질문과 의문이 절실한 주제의 책을 찾아 읽어라',
  '감명 깊은 책은 개별적이고 주관적이다',
  '실천이 없는 지식, 성찰이 없는 사유는 허구다',
] as const
const ROTATE_MS = 5000

const placeholderIndex = ref(0)
const placeholder = computed(() => PLACEHOLDERS[placeholderIndex.value] ?? PLACEHOLDERS[0])

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    placeholderIndex.value = (placeholderIndex.value + 1) % PLACEHOLDERS.length
  }, ROTATE_MS)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <form class="search" @submit.prevent="emit('submit')">
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A79C88" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>
    <input v-model="value" type="text" :placeholder="placeholder">
    <button type="submit" class="go">검색</button>
  </form>
</template>

<style scoped>
.search { max-width: 660px; margin: 0 auto; display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid var(--line-strong); border-radius: 999px; padding: 14px 22px; box-shadow: 0 2px 10px rgba(84,70,45,.07); }
.search:focus-within { border-color: var(--red); }
.search input { border: 0; outline: 0; flex: 1; font: inherit; font-size: 15.5px; background: transparent; color: var(--ink); }
.search .go { background: var(--red); color: #fff; border: 0; border-radius: 999px; padding: 8px 20px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.search .go:hover { background: var(--red-dark); }
</style>
