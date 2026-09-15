<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})

/**
 * 검색창 안내 문구 — 5초마다 순환(QA #51). 명언은 히어로 타이틀로 옮기고(QA #52),
 * 여기엔 AI 검색에 바로 던질 수 있는 예시 질문을 보여준다.
 */
const PLACEHOLDERS = [
  '팀장이 처음인데 리더십 책 추천해줘',
  '협상을 잘하고 싶어요, 어떤 책이 좋을까요?',
  '요즘 번아웃이에요. 마음을 다잡는 책 있을까요?',
  '파이썬 입문서 있어?',
  '경제 흐름을 읽는 눈을 키우고 싶어요',
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

@media (max-width: 640px) {
  .search { padding: 10px 14px; gap: 8px; }
  .search svg { width: 17px; height: 17px; flex-shrink: 0; }
  .search input { font-size: 14.5px; min-width: 0; }
  .search .go { padding: 7px 14px; font-size: 13px; flex-shrink: 0; }
}
</style>
