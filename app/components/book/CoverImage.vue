<script setup lang="ts">
defineProps<{
  src: string | null
  alt: string
}>()
</script>

<template>
  <div class="cv">
    <img v-if="src" :src="src" :alt="alt">
    <div v-else class="cv-empty">{{ alt }}</div>
  </div>
</template>

<style scoped>
.cv-empty {
  width: 100%;
  height: 100%;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--sub);
  background: #EDE7DA;
}
</style>
