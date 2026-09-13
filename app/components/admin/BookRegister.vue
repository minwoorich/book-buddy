<script setup lang="ts">
import type { Book, ExternalBookItem } from '#shared/types'
import { BOOK_CATEGORIES } from '#shared/types'

const emit = defineEmits<{ registered: [Book] }>()

const api = useApi()

const query = ref('')
const results = ref<ExternalBookItem[]>([])
const searching = ref(false)
const searched = ref(false)
const registeringIsbn = ref<string | null>(null)
// isbn13이 없는 결과가 있을 수 있어 인덱스로도 카테고리 선택을 보관한다.
const categoryByRow = ref<Record<number, string>>({})

async function search() {
  const q = query.value.trim()
  if (!q || searching.value) return
  searching.value = true
  try {
    results.value = await api<ExternalBookItem[]>('/api/book-search', { query: { query: q } })
    searched.value = true
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    searching.value = false
  }
}

/** 희망도서 신청 승인 후 부모가 검색어를 채워 바로 검색까지 실행할 때 쓴다. */
async function prefillAndSearch(title: string) {
  query.value = title
  await search()
}

defineExpose({ prefillAndSearch })

function rowKey(item: ExternalBookItem, idx: number): string {
  return item.isbn13 ?? `idx-${idx}`
}

async function register(item: ExternalBookItem, idx: number) {
  const category = categoryByRow.value[idx]
  if (!category) {
    alert('카테고리를 선택해주세요')
    return
  }
  const busyKey = rowKey(item, idx)
  registeringIsbn.value = busyKey
  try {
    const book = await api<Book>('/api/books', {
      method: 'POST',
      body: {
        title: item.title,
        author: item.author,
        publisher: item.publisher,
        pubDate: item.pubDate,
        description: item.description,
        isbn13: item.isbn13,
        cover: item.cover,
        category,
        pageCount: item.pageCount,
      },
    })
    alert('서가에 등록했어요')
    emit('registered', book)
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    registeringIsbn.value = null
  }
}
</script>

<template>
  <div>
    <div style="display:flex; gap:10px;">
      <input
        v-model="query"
        class="input"
        style="flex:1;"
        placeholder="검색할 책 제목을 입력하세요"
        @keyup.enter="search"
      >
      <button type="button" class="btn" :disabled="searching" @click="search">네이버 검색</button>
    </div>

    <p v-if="searched && !results.length" class="hint">검색 결과가 없어요.</p>

    <div
      v-for="(item, idx) in results"
      :key="rowKey(item, idx)"
      class="reg-result"
    >
      <BookCoverImage :src="item.cover" :alt="item.title" />
      <div style="flex:1;">
        <b style="font-size:14px;">{{ item.title }}</b>
        <div style="font-size:12.5px; color:var(--sub);">
          {{ item.author }} · {{ item.publisher }}<template v-if="item.pubDate"> · {{ item.pubDate }}</template>
        </div>
      </div>
      <select v-model="categoryByRow[idx]" class="input" style="width:auto;">
        <option value="" disabled>카테고리</option>
        <option v-for="cat in BOOK_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
      </select>
      <button
        type="button"
        class="btn primary sm"
        :disabled="registeringIsbn === rowKey(item, idx)"
        @click="register(item, idx)"
      >서가에 등록</button>
    </div>
  </div>
</template>

<style scoped>
.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }
.reg-result { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 4px; padding: 10px 12px; margin-top: 12px; }
.reg-result :deep(.cv) { width: 38px; height: 54px; }
</style>
