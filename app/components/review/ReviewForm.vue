<script setup lang="ts">
const props = defineProps<{ bookId: number; autofocus?: boolean }>()
const emit = defineEmits<{ created: [] }>()

const api = useApi()

const rating = ref(5)
const content = ref('')
const submitting = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

onMounted(() => {
  if (props.autofocus) inputEl.value?.focus()
})

async function submit() {
  const trimmed = content.value.trim()
  if (!trimmed || submitting.value) return
  submitting.value = true
  try {
    await api(`/api/books/${props.bookId}/reviews`, {
      method: 'POST',
      body: { rating: rating.value, content: trimmed },
    })
    content.value = ''
    rating.value = 5
    emit('created')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="panel review-form-panel">
    <div class="review-form">
      <ReviewStarRating v-model="rating" />
      <input
        ref="inputEl"
        v-model="content"
        class="input"
        placeholder="한줄 리뷰를 남겨주세요"
        @keyup.enter="submit"
      >
      <button type="button" class="btn primary" :disabled="submitting" @click="submit">등록</button>
    </div>
  </div>
</template>

<style scoped>
.review-form-panel { padding: 16px 18px; margin-bottom: 18px; }
.review-form { display: flex; align-items: center; gap: 12px; }
.review-form .input { flex: 1; }
.review-form :deep(.star-rating) svg { width: 22px; height: 22px; }
</style>
