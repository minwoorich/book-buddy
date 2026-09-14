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
const bookId = ref('')
const submitting = ref(false)
const bookOptions = ref<Book[]>([])

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
    bookOptions.value = result
  } catch {
    bookOptions.value = []
  }
})

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
    images.value.push({ file, url: URL.createObjectURL(file) })
  }
}

function removeImage(index: number) {
  const [removed] = images.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
}

onBeforeUnmount(revokeAllPreviews)

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
    if (bookId.value) formData.append('bookId', bookId.value)
    await api('/api/posts', { method: 'POST', body: formData })

    revokeAllPreviews()
    caption.value = ''
    bookId.value = ''
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
      <input ref="fileInput" type="file" accept="image/*" multiple @change="handleFileChange">
      <div v-if="images.length" class="thumbs">
        <div v-for="(img, i) in images" :key="img.url" class="thumb">
          <img :src="img.url" alt="선택한 사진">
          <span v-if="i === 0" class="badge">대표</span>
          <button type="button" class="remove" aria-label="사진 제거" @click="removeImage(i)">×</button>
        </div>
      </div>
      <span v-else class="placeholder">사진을 선택해주세요 (최대 5장)</span>
      <textarea v-model="caption" class="input" rows="3" placeholder="오늘의 독서 순간을 기록해보세요" />
      <select v-model="bookId" class="input">
        <option value="">태그 없음</option>
        <option v-for="b in bookOptions" :key="b.id" :value="String(b.id)">{{ b.title }}</option>
      </select>
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
.placeholder { font-size: 12px; color: var(--sub); }
.thumbs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.thumb { position: relative; width: 92px; height: 92px; flex-shrink: 0; border-radius: 3px; overflow: hidden; background: #EDE7DA; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .badge { position: absolute; left: 4px; bottom: 4px; background: var(--red); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; }
.thumb .remove { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0, 0, 0, .55); color: #fff; font-size: 13px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.thumb .remove:hover { background: rgba(0, 0, 0, .75); }
.composer-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
