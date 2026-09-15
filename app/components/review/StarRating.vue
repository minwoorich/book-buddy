<script setup lang="ts">
const props = defineProps<{ modelValue: number; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [number] }>()

const STAR_PATH = 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z'
const stars = [1, 2, 3, 4, 5]

// readonly일 때는 0.5 단위로 내림해 표시(예: 4.7 → 4.5칸 채움). 편집 모드는 정수 선택만 지원.
function isFilled(n: number): boolean {
  if (props.readonly) return n <= Math.floor(props.modelValue * 2) / 2
  return n <= props.modelValue
}

function select(n: number) {
  if (props.readonly) return
  emit('update:modelValue', n)
}
</script>

<template>
  <span class="star-rating" :class="{ readonly }">
    <svg
      v-for="n in stars"
      :key="n"
      viewBox="0 0 24 24"
      :style="{ fill: isFilled(n) ? 'var(--star)' : 'var(--star-off)' }"
      @click="select(n)"
    ><path :d="STAR_PATH" /></svg>
  </span>
</template>

<style scoped>
.star-rating { display: inline-flex; gap: 2px; }
.star-rating:not(.readonly) svg { cursor: pointer; }
</style>
