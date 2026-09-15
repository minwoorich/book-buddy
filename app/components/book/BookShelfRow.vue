<script setup lang="ts">
import type { Book } from '#shared/types'

const props = withDefaults(
  defineProps<{
    books: (Book & { avgRating: number | null; reviewCount: number })[]
    columns?: number
  }>(),
  { columns: 6 }
)

// columns는 데스크톱 기준 칸 수 — 태블릿 4칸, 모바일 3칸으로 줄여 줄을 다시 나눈다.
const columns = useShelfColumns(props.columns, Math.min(props.columns, 4), Math.min(props.columns, 3))

const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }))

// books를 columns개씩 줄 단위로 나눈다 — 각 줄마다 covers-row → .shelf → meta-row를 반복 렌더해
// 7권 이상일 때도 줄바꿈이 서가(선반) 단위로 깔끔하게 떨어지게 한다.
const rows = computed(() => chunk(props.books, columns.value))
</script>

<template>
  <div v-for="(row, i) in rows" :key="i" class="shelf-row">
    <div class="shelf-grid covers-row" :style="gridStyle">
      <NuxtLink v-for="book in row" :key="book.id" :to="`/books/${book.id}`">
        <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
      </NuxtLink>
    </div>
    <div class="shelf" />
    <div class="meta-row" :style="gridStyle">
      <div v-for="book in row" :key="book.id" class="meta">
        <div class="t">{{ book.title }}</div>
        <div class="a">{{ book.author }}</div>
        <span v-if="book.avgRating !== null" class="stars">
          <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z"/></svg>{{ book.avgRating.toFixed(1) }} · {{ book.reviewCount }}
        </span>
        <span v-else class="stars">리뷰 없음</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shelf-row + .shelf-row { margin-top: 28px; }
.covers-row .cv { aspect-ratio: 500 / 726; width: 100%; }
.shelf { margin: 0 -14px; }
.meta-row { display: grid; gap: 22px; }
.meta { text-align: center; padding-top: 16px; }
.meta .t { font-size: 14.5px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .a { font-size: 13px; color: var(--sub); margin-bottom: 4px; }

@media (max-width: 640px) {
  .shelf-row + .shelf-row { margin-top: 22px; }
  .shelf-grid, .meta-row { gap: 12px; }
  .meta { padding-top: 12px; }
  .meta .t { font-size: 13px; }
  .meta .a { font-size: 12px; }
}
</style>
