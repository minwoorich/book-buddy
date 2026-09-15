<script setup lang="ts">
import type { Book } from '#shared/types'

const props = withDefaults(
  defineProps<{
    books: (Book & { avgRating: number | null; reviewCount: number })[]
    columns?: number
  }>(),
  { columns: 6 }
)

// columns는 데스크톱 기준 칸 수 — 태블릿은 4칸으로 줄여 줄을 다시 나눈다.
const columns = useShelfColumns(props.columns, Math.min(props.columns, 4), Math.min(props.columns, 3))

// 모바일(≤640px)은 줄바꿈 대신 한 줄 스와이프(QA #75) — 책이 많아도 아래로 길어지지 않는다.
const isMobile = useIsMobile()

const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }))

// books를 columns개씩 줄 단위로 나눈다 — 각 줄마다 covers-row → .shelf → meta-row를 반복 렌더해
// 7권 이상일 때도 줄바꿈이 서가(선반) 단위로 깔끔하게 떨어지게 한다.
const rows = computed(() => chunk(props.books, columns.value))
</script>

<template>
  <!-- 모바일: 가로 스크롤 한 줄. 각 칸이 자기 선반 조각을 그려 이어 붙이면 연속된 선반처럼 보인다. -->
  <div v-if="isMobile" class="swipe-track">
    <NuxtLink v-for="book in books" :key="book.id" :to="`/books/${book.id}`" class="swipe-item">
      <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
      <div class="shelf swipe-shelf" />
      <div class="meta">
        <div class="t">{{ book.title }}</div>
        <div class="a">{{ book.author }}</div>
        <span v-if="book.avgRating !== null" class="stars">
          <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z"/></svg>{{ book.avgRating.toFixed(1) }}
        </span>
        <span v-else class="stars">리뷰 없음</span>
      </div>
    </NuxtLink>
  </div>

  <template v-else>
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
            <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z"/></svg>{{ book.avgRating.toFixed(1) }}
          </span>
          <span v-else class="stars">리뷰 없음</span>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.shelf-row + .shelf-row { margin-top: 28px; }
.covers-row .cv { aspect-ratio: 500 / 726; width: 100%; }
.shelf { margin: 0 -14px; }
.meta-row { display: grid; gap: 22px; }
.meta { text-align: center; padding-top: 16px; }
.meta .t { font-size: 14.5px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .a { font-size: 13px; color: var(--sub); margin-bottom: 4px; }

/* 모바일 스와이프 서가(QA #75): 3칸 남짓 보이고 옆으로 넘긴다. 스크롤바는 숨기고 스냅으로 칸 맞춤. */
.swipe-track {
  display: flex; gap: 0; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
  margin: 0 -16px; padding: 0 10px 6px; scrollbar-width: none;
}
.swipe-track::-webkit-scrollbar { display: none; }
.swipe-item {
  flex: 0 0 33.333%; scroll-snap-align: start; padding: 0 6px;
  color: inherit; text-decoration: none; display: block; min-width: 0;
}
.swipe-item .cv { aspect-ratio: 500 / 726; width: 100%; }
.swipe-shelf { margin: 0 -6px; }
.swipe-item .meta { padding-top: 12px; }
.swipe-item .meta .t { font-size: 13px; }
.swipe-item .meta .a { font-size: 12px; }

@media (max-width: 640px) {
  .shelf-row + .shelf-row { margin-top: 22px; }
  .shelf-grid, .meta-row { gap: 12px; }
  .meta { padding-top: 12px; }
  .meta .t { font-size: 13px; }
  .meta .a { font-size: 12px; }
}
</style>
