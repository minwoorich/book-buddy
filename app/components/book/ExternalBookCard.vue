<script setup lang="ts">
import type { ExternalBookSearchItem } from '#shared/types'

const props = defineProps<{ item: ExternalBookSearchItem }>()

const api = useApi()
const requesting = ref(false)

function onCardClick() {
  if (props.item.inLibrary && props.item.libraryBookId) {
    navigateTo(`/books/${props.item.libraryBookId}`)
  }
}

async function requestPurchase() {
  if (requesting.value) return
  requesting.value = true
  try {
    await api('/api/purchase-requests', {
      method: 'POST',
      body: {
        title: props.item.title,
        author: props.item.author,
        isbn13: props.item.isbn13,
        coverUrl: props.item.cover,
        reason: '검색에서 신청',
      },
    })
    alert('신청했어요')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    requesting.value = false
  }
}
</script>

<template>
  <div class="ext-card" :class="{ clickable: item.inLibrary }" @click="onCardClick">
    <BookCoverImage :src="item.cover" :alt="item.title" />
    <div class="meta">
      <div class="t">{{ item.title }}</div>
      <div class="a">{{ item.author }}</div>
      <div class="p">{{ item.publisher }}</div>
      <span class="badge" :class="item.inLibrary ? 'ok' : 'no'">{{ item.inLibrary ? '사내 보유' : '사내 미보유' }}</span>
    </div>
    <button
      v-if="!item.inLibrary"
      type="button"
      class="btn sm"
      :disabled="requesting"
      @click.stop="requestPurchase"
    >희망도서 신청</button>
  </div>
</template>

<style scoped>
.ext-card { display: flex; flex-direction: column; gap: 8px; }
.ext-card.clickable { cursor: pointer; }
.ext-card :deep(.cv) { aspect-ratio: 500 / 726; width: 100%; }
.meta { text-align: center; }
.meta .t { font-size: 13.5px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .a, .meta .p { font-size: 12px; color: var(--sub); }
.meta .p { margin-bottom: 4px; }
.ext-card .btn { width: 100%; }
</style>
