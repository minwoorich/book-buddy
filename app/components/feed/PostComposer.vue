<script setup lang="ts">
import type { Book, Loan } from '#shared/types'

type LoanWithBook = Loan & { book: Book }

const emit = defineEmits<{ created: []; cancel: [] }>()

const api = useApi()

const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
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

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  selectedFile.value = file
  revokePreview()
  if (file) previewUrl.value = URL.createObjectURL(file)
}

onBeforeUnmount(revokePreview)

async function submit() {
  if (submitting.value) return
  if (!selectedFile.value) {
    alert('사진을 선택해주세요')
    return
  }
  submitting.value = true
  try {
    const formData = new FormData()
    formData.append('image', selectedFile.value)
    if (caption.value.trim()) formData.append('caption', caption.value.trim())
    if (bookId.value) formData.append('bookId', bookId.value)
    await api('/api/posts', { method: 'POST', body: formData })

    selectedFile.value = null
    revokePreview()
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
    <div class="composer-row">
      <div class="preview">
        <img v-if="previewUrl" :src="previewUrl" alt="미리보기">
        <span v-else class="placeholder">사진 미리보기</span>
      </div>
      <div class="fields">
        <input ref="fileInput" type="file" accept="image/*" @change="handleFileChange">
        <textarea v-model="caption" class="input" rows="3" placeholder="오늘의 독서 순간을 기록해보세요" />
        <select v-model="bookId" class="input">
          <option value="">태그 없음</option>
          <option v-for="b in bookOptions" :key="b.id" :value="String(b.id)">{{ b.title }}</option>
        </select>
      </div>
    </div>
    <div class="composer-acts">
      <button type="button" class="btn" @click="cancel">취소</button>
      <button type="button" class="btn primary" :disabled="submitting" @click="submit">올리기</button>
    </div>
  </div>
</template>

<style scoped>
.composer { margin-bottom: 26px; }
.composer-row { display: flex; gap: 18px; }
.preview { width: 140px; height: 105px; flex-shrink: 0; border-radius: 3px; background: #EDE7DA; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.preview img { width: 100%; height: 100%; object-fit: cover; }
.preview .placeholder { font-size: 12px; color: var(--sub); text-align: center; padding: 8px; }
.fields { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.fields textarea { resize: vertical; font-family: inherit; }
.composer-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
