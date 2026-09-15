<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const categories = ['전체', '경제경영', 'IT · 프로그래밍', '자기계발', '인문']
</script>

<template>
  <div class="cats">
    <span
      v-for="cat in categories"
      :key="cat"
      :class="{ on: cat === modelValue }"
      @click="emit('update:modelValue', cat)"
    >{{ cat }}</span>
  </div>
</template>

<style scoped>
.cats { display: flex; gap: 22px; justify-content: center; margin-top: 20px; font-size: 13.5px; color: var(--sub); }
.cats .on { color: var(--red); font-weight: 700; }
.cats span { cursor: pointer; }

@media (max-width: 640px) {
  .cats {
    justify-content: flex-start; gap: 16px; margin: 16px -16px 0; padding: 0 16px;
    overflow-x: auto; white-space: nowrap; scrollbar-width: none;
  }
  .cats::-webkit-scrollbar { display: none; }
  .cats span { flex-shrink: 0; }
}
</style>
