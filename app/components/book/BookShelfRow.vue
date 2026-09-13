<script setup lang="ts">
import type { Book } from '#shared/types'

const props = withDefaults(
  defineProps<{
    books: (Book & { avgRating: number | null; reviewCount: number })[]
    columns?: number
  }>(),
  { columns: 6 }
)

const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))` }))
</script>

<template>
  <div class="shelf-grid covers-row" :style="gridStyle">
    <NuxtLink v-for="book in books" :key="book.id" :to="`/books/${book.id}`">
      <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
    </NuxtLink>
  </div>
  <div class="shelf" />
  <div class="meta-row" :style="gridStyle">
    <div v-for="book in books" :key="book.id" class="meta">
      <div class="t">{{ book.title }}</div>
      <div class="a">{{ book.author }}</div>
      <span v-if="book.avgRating !== null" class="stars">
        <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z"/></svg>{{ book.avgRating.toFixed(1) }} · {{ book.reviewCount }}
      </span>
      <span v-else class="stars">리뷰 없음</span>
    </div>
  </div>
</template>

<style scoped>
.covers-row .cv { aspect-ratio: 500 / 726; width: 100%; }
.shelf { margin: 0 -14px; }
.meta-row { display: grid; gap: 22px; }
.meta { text-align: center; padding-top: 16px; }
.meta .t { font-size: 13.5px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .a { font-size: 12px; color: var(--sub); margin-bottom: 4px; }
</style>
