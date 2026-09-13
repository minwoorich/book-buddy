<script setup lang="ts">
import type { Book } from '#shared/types'

withDefaults(
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
</script>

<template>
  <div>
    <div class="sec-head" style="margin-top:0;">
      <h2>{{ title }}</h2>
      <div class="rule" />
    </div>

    <template v-if="books.length">
      <div class="shelf-grid shelf8">
        <NuxtLink v-for="book in books" :key="book.id" :to="`/books/${book.id}`">
          <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
        </NuxtLink>
      </div>
      <div class="shelf" style="margin: 0 -10px;" />
      <div v-if="metaTexts || actionLabel" class="shelf-meta">
        <div v-for="(book, i) in books" :key="book.id">
          <div v-if="metaTexts && metaTexts[i]" class="meta-text">{{ metaTexts[i] }}</div>
          <button
            v-if="actionLabel"
            type="button"
            class="btn sm"
            @click="$emit('action', i)"
          >{{ actionLabel }}</button>
        </div>
      </div>
    </template>

    <div v-else class="shelf-grid shelf8">
      <div class="slot empty-slot">{{ emptyText }}</div>
    </div>
  </div>
</template>

<style scoped>
.shelf-grid { display: grid; gap: 22px; align-items: end; }
.shelf8 { grid-template-columns: repeat(8, minmax(0, 1fr)); }
.shelf8 :deep(.cv) { aspect-ratio: 500 / 726; width: 100%; }
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
.shelf-meta { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 22px; margin-top: 10px; }
.shelf-meta > div { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.meta-text { font-size: 11.5px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
</style>
