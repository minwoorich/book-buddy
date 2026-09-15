<script setup lang="ts">
import type { Book } from '#shared/types'

const props = withDefaults(
  defineProps<{
    title: string
    books: Book[]
    emptyText?: string
    metaTexts?: string[]
    actionLabel?: string
  }>(),
  { emptyText: '표시할 책이 없어요' }
)

defineEmits<{ action: [index: number] }>()

// 데스크톱 8칸, 태블릿 5칸, 모바일 3칸 — 줄마다 "표지 → 선반 → 메타"를 반복해
// 어떤 폭에서도 선반이 줄 밑에 정확히 놓이게 한다.
const columns = useShelfColumns(8, 5, 3)
const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }))

/** 원본 인덱스를 함께 들고 다닌다 — metaTexts와 action 이벤트가 전체 배열 기준이라서. */
const rows = computed(() =>
  chunk(props.books.map((book, index) => ({ book, index })), columns.value)
)
</script>

<template>
  <div>
    <div class="sec-head" style="margin-top:0;">
      <h2>{{ title }}</h2>
      <div class="rule" />
    </div>

    <template v-if="books.length">
      <div v-for="(row, r) in rows" :key="r" class="shelf-row">
        <div class="shelf-grid" :style="gridStyle">
          <NuxtLink v-for="{ book } in row" :key="book.id" :to="`/books/${book.id}`">
            <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
          </NuxtLink>
        </div>
        <div class="shelf" style="margin: 0 -10px;" />
        <div v-if="metaTexts || actionLabel" class="shelf-meta" :style="gridStyle">
          <div v-for="{ book, index } in row" :key="book.id">
            <div v-if="metaTexts && metaTexts[index]" class="meta-text">{{ metaTexts[index] }}</div>
            <button
              v-if="actionLabel"
              type="button"
              class="btn sm"
              @click="$emit('action', index)"
            >{{ actionLabel }}</button>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="shelf-grid" :style="gridStyle">
      <div class="slot empty-slot">{{ emptyText }}</div>
    </div>
  </div>
</template>

<style scoped>
.shelf-row + .shelf-row { margin-top: 26px; }
.shelf-grid { display: grid; gap: 22px; align-items: end; }
.shelf-grid :deep(.cv) { aspect-ratio: 500 / 726; width: 100%; }
.slot {
  aspect-ratio: 500 / 726;
  border: 1.5px dashed var(--line-strong);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #B9AE97;
  font-size: 12px;
}
.empty-slot {
  grid-column: 1 / -1;
  aspect-ratio: auto;
  padding: 20px 14px;
  text-align: center;
  white-space: normal;
}
.shelf-meta { display: grid; gap: 22px; margin-top: 10px; }
.shelf-meta > div { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.meta-text { font-size: 11.5px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }

@media (max-width: 640px) {
  .shelf-grid, .shelf-meta { gap: 12px; }
  .shelf-meta .btn { padding: 5px 8px; font-size: 12px; }
}
</style>
