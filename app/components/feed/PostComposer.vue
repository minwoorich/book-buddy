<script setup lang="ts">
import type { Book, Loan } from '#shared/types'

type LoanWithBook = Loan & { book: Book }

interface SelectedImage {
  file: File
  url: string
}

const MAX_IMAGES = 5

const emit = defineEmits<{ created: []; cancel: [] }>()

const api = useApi()

const fileInput = ref<HTMLInputElement | null>(null)
const images = ref<SelectedImage[]>([])
const caption = ref('')
const submitting = ref(false)

// ── 책 태그: 전체 도서에서 검색해 선택한다(QA #7·#11 — 대출 이력이 없어도 태그 가능). ──
const selectedBook = ref<Book | null>(null)
const bookQuery = ref('')
const bookResults = ref<Book[]>([])
const bookSearching = ref(false)
/** 검색어가 비어 있을 때 보여줄 제안: 내가 빌렸던(읽고 있는·읽은) 책. */
const myBooks = ref<Book[]>([])

onMounted(async () => {
  try {
    const [active, done] = await Promise.all([
      api<LoanWithBook[]>('/api/loans', { query: { active: true } }),
      api<LoanWithBook[]>('/api/loans', { query: { returned: true } }),
    ])
    const seen = new Set<number>()
    const result: Book[] = []
    for (const loan of [...active, ...done]) {
      if (seen.has(loan.book.id)) continue
      seen.add(loan.book.id)
      result.push(loan.book)
    }
    myBooks.value = result
  } catch {
    myBooks.value = []
  }
})

let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSeq = 0 // 응답 역전 가드 — 늦게 도착한 옛 검색 결과가 최신 목록을 덮지 않게(QA #46)
watch(bookQuery, (q) => {
  clearTimeout(searchTimer)
  const keyword = q.trim()
  const seq = ++searchSeq
  if (!keyword) {
    bookResults.value = []
    bookSearching.value = false
    return
  }
  bookSearching.value = true
  searchTimer = setTimeout(async () => {
    try {
      const found = await api<Book[]>('/api/books', { query: { query: keyword } })
      if (seq !== searchSeq) return // 그 사이 새 검색이 시작됐다 — 이 결과는 버린다
      bookResults.value = found.slice(0, 8)
    } catch {
      if (seq === searchSeq) bookResults.value = []
    } finally {
      if (seq === searchSeq) bookSearching.value = false
    }
  }, 250)
})

/** 드롭다운에 실제로 보여줄 목록: 검색어가 있으면 검색 결과, 없으면 내 책 제안. */
const suggestions = computed(() => (bookQuery.value.trim() ? bookResults.value : myBooks.value.slice(0, 8)))

function pickBook(book: Book) {
  selectedBook.value = book
  bookQuery.value = ''
  bookResults.value = []
}

function clearBook() {
  selectedBook.value = null
}

function revokeAllPreviews() {
  for (const img of images.value) URL.revokeObjectURL(img.url)
  images.value = []
}

/** 선택할 때마다 기존 목록에 누적 추가(인스타식). 5장 초과분은 무시하고 알린다. */
function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  target.value = '' // 같은 파일을 다시 선택할 수 있도록 초기화

  if (files.length === 0) return

  const room = MAX_IMAGES - images.value.length
  if (room <= 0) {
    alert('사진은 최대 5장까지예요')
    return
  }
  if (files.length > room) alert('사진은 최대 5장까지예요')

  for (const file of files.slice(0, room)) {
    // 업로드가 조용히 실패하는 흔한 원인 두 가지를 선택 시점에 잡아준다(QA #42):
    // 지원하지 않는 형식(아이폰 HEIC 등)과 과대 용량.
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.type)) {
      alert(`"${file.name}"은(는) 지원하지 않는 형식이에요. jpg·png·webp·gif만 올릴 수 있어요.`)
      continue
    }
    if (file.size > 8 * 1024 * 1024) {
      alert(`"${file.name}"이(가) 너무 커요(8MB 초과). 스크린샷이나 압축본으로 올려주세요.`)
      continue
    }
    images.value.push({ file, url: URL.createObjectURL(file) })
  }
}

function removeImage(index: number) {
  const [removed] = images.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
}

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  revokeAllPreviews()
})

async function submit() {
  if (submitting.value) return
  if (images.value.length === 0) {
    alert('사진을 선택해주세요')
    return
  }
  submitting.value = true
  try {
    const formData = new FormData()
    for (const img of images.value) formData.append('image', img.file)
    if (caption.value.trim()) formData.append('caption', caption.value.trim())
    if (selectedBook.value) formData.append('bookId', String(selectedBook.value.id))
    await api('/api/posts', { method: 'POST', body: formData })

    revokeAllPreviews()
    caption.value = ''
    selectedBook.value = null
    bookQuery.value = ''
    if (fileInput.value) fileInput.value.value = ''
    emit('created')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    submitting.value = false
  }
}

function cancel() {
  emit('cancel')
}
</script>

<template>
  <div class="panel composer">
    <div class="fields">
      <div class="photo-row">
        <label class="btn sm file-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          사진 추가
          <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="handleFileChange">
        </label>
        <span class="placeholder">{{ images.length ? `${images.length}장 선택 · 첫 장이 대표 사진` : '사진을 선택해주세요 (최대 5장)' }}</span>
      </div>
      <div v-if="images.length" class="thumbs">
        <div v-for="(img, i) in images" :key="img.url" class="thumb">
          <img :src="img.url" alt="선택한 사진">
          <span v-if="i === 0" class="badge">대표</span>
          <button type="button" class="remove" aria-label="사진 제거" @click="removeImage(i)">×</button>
        </div>
      </div>
      <textarea v-model="caption" class="input" rows="3" placeholder="오늘의 독서 순간을 기록해보세요" />

      <div v-if="selectedBook" class="picked">
        <img v-if="selectedBook.coverUrl" :src="selectedBook.coverUrl" alt="" />
        <div class="picked-info">
          <b>{{ selectedBook.title }}</b>
          <span>{{ selectedBook.author }}</span>
        </div>
        <button type="button" class="remove-book" aria-label="책 태그 제거" @click="clearBook">×</button>
      </div>
      <div v-else class="book-picker">
        <input
          v-model="bookQuery"
          type="search"
          class="input"
          placeholder="함께 올릴 책 검색 (제목·저자) — 선택하지 않아도 돼요"
        />
        <div v-if="bookSearching" class="picker-hint">검색 중...</div>
        <div v-else-if="bookQuery.trim() && suggestions.length === 0" class="picker-hint">검색 결과가 없어요</div>
        <div v-else-if="suggestions.length" class="picker-list">
          <div v-if="!bookQuery.trim()" class="picker-label">내가 빌렸던 책</div>
          <button v-for="b in suggestions" :key="b.id" type="button" class="picker-item" @click="pickBook(b)">
            <img v-if="b.coverUrl" :src="b.coverUrl" alt="" />
            <span class="pi-title">{{ b.title }}</span>
            <span class="pi-author">{{ b.author }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="composer-acts">
      <button type="button" class="btn" @click="cancel">취소</button>
      <button type="button" class="btn primary" :disabled="submitting || images.length === 0" @click="submit">올리기</button>
    </div>
  </div>
</template>

<style scoped>
.composer { margin-bottom: 26px; }
.fields { display: flex; flex-direction: column; gap: 10px; }
.fields textarea { resize: vertical; font-family: inherit; }
/* 브라우저 기본 파일 입력("파일 선택 | 선택된 파일 없음")은 모바일에서 특히 어수선해 버튼으로 감싼다. */
.photo-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-btn { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.placeholder { font-size: 12px; color: var(--sub); }
.thumbs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.thumb { position: relative; width: 92px; height: 92px; flex-shrink: 0; border-radius: 3px; overflow: hidden; background: #EDE7DA; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .badge { position: absolute; left: 4px; bottom: 4px; background: var(--red); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; }
.thumb .remove { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0, 0, 0, .55); color: #fff; font-size: 13px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.thumb .remove:hover { background: rgba(0, 0, 0, .75); }
.composer-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

.book-picker { display: flex; flex-direction: column; gap: 6px; }
.picker-hint { font-size: 12.5px; color: var(--sub); padding: 2px 2px 0; }
.picker-label { font-size: 11.5px; font-weight: 700; color: var(--sub); padding: 4px 4px 0; }
.picker-list { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 4px; max-height: 240px; overflow-y: auto; background: var(--card); }
.picker-item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 0; background: none; cursor: pointer; font: inherit; text-align: left; border-bottom: 1px solid var(--line); }
.picker-item:last-child { border-bottom: 0; }
.picker-item:hover { background: var(--red-tint); }
.picker-item img { width: 26px; height: 38px; object-fit: cover; border-radius: 2px; flex-shrink: 0; }
.pi-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pi-author { font-size: 12px; color: var(--sub); margin-left: auto; flex-shrink: 0; }

.picked { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line-strong); border-radius: 4px; padding: 8px 10px; background: var(--bg); }
.picked img { width: 30px; height: 44px; object-fit: cover; border-radius: 2px; }
.picked-info { flex: 1; min-width: 0; }
.picked-info b { display: block; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picked-info span { font-size: 12px; color: var(--sub); }
.remove-book { border: 0; background: none; font-size: 17px; color: var(--sub); cursor: pointer; padding: 0 4px; }
.remove-book:hover { color: var(--red); }
</style>
