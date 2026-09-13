<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()

const value = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})
</script>

<template>
  <form class="search" @submit.prevent="emit('submit')">
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A79C88" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>
    <input v-model="value" type="text" placeholder="궁금한 걸 물어보거나 책 제목·저자로 검색해보세요">
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
