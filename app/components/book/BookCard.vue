<script setup lang="ts">
import type { Book } from '#shared/types'

defineProps<{
  book: Book & {
    status: 'available' | 'loaned'
    waitingCount: number
    avgRating: number | null
    reviewCount: number
  }
}>()
</script>

<template>
  <NuxtLink :to="`/books/${book.id}`" class="book-card">
    <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
    <div class="meta">
      <div class="t">{{ book.title }}</div>
      <div class="a">{{ book.author }}</div>
      <span v-if="book.avgRating !== null" class="stars">
        <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z"/></svg>{{ book.avgRating.toFixed(1) }}
      </span>
      <span v-else class="stars">리뷰 없음</span>
      <div class="status">
        <BookStatusBadge :status="book.status" :waiting-count="book.waitingCount" />
      </div>
    </div>
  </NuxtLink>
</template>

<style scoped>
.book-card { display: block; color: inherit; }
.book-card .cv { aspect-ratio: 500 / 726; width: 100%; margin-bottom: 10px; }
.meta { text-align: center; }
.meta .t { font-size: 13.5px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .a { font-size: 12px; color: var(--sub); margin-bottom: 4px; }
.meta .status { margin-top: 4px; }
</style>
