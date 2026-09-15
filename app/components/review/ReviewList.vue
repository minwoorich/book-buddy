<script setup lang="ts">
import type { Review } from '#shared/types'

type ReviewWithMeta = Review & {
  userName: string
  department: string
  voteCount: number
  votedByMe: boolean
}

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const { user } = useCurrentUser()

const { data: reviews, pending, refresh } = await useAsyncData<ReviewWithMeta[]>(
  'book-reviews',
  () => api<ReviewWithMeta[]>(`/api/books/${props.bookId}/reviews`),
  { watch: [() => props.bookId], default: () => [] }
)

async function toggleVote(review: ReviewWithMeta) {
  if (!user.value) {
    alert('로그인이 필요해요')
    return
  }
  try {
    if (review.votedByMe) {
      await api(`/api/reviews/${review.id}/votes`, { method: 'DELETE' })
    } else {
      await api(`/api/reviews/${review.id}/votes`, { method: 'POST' })
    }
  } catch (e) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    if (statusCode !== 409) {
      alert(apiErrorMessage(e))
      return
    }
  }
  await refresh()
}

// ── 내 리뷰 수정/삭제 (QA #16) ─────────────────────────────────────
const editingId = ref<number | null>(null)
const editRating = ref(5)
const editContent = ref('')
const busy = ref(false)

function isMine(review: ReviewWithMeta): boolean {
  return !!user.value && review.userId === user.value.id
}

function startEdit(review: ReviewWithMeta) {
  editingId.value = review.id
  editRating.value = review.rating
  editContent.value = review.content
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(review: ReviewWithMeta) {
  const trimmed = editContent.value.trim()
  if (!trimmed || busy.value) return
  busy.value = true
  try {
    await api(`/api/reviews/${review.id}`, {
      method: 'PATCH',
      body: { rating: editRating.value, content: trimmed },
    })
    editingId.value = null
    await refresh()
    emit('changed')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busy.value = false
  }
}

async function removeReview(review: ReviewWithMeta) {
  if (busy.value) return
  if (!confirm('이 리뷰를 삭제할까요?')) return
  busy.value = true
  try {
    await api(`/api/reviews/${review.id}`, { method: 'DELETE' })
    await refresh()
    emit('changed')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busy.value = false
  }
}

defineExpose({ refresh })
</script>

<template>
  <div>
    <p v-if="pending && !reviews.length" class="hint">불러오는 중…</p>
    <p v-else-if="!reviews.length" class="hint">아직 리뷰가 없어요. 첫 리뷰를 남겨보세요.</p>
    <div v-for="review in reviews" :key="review.id" class="review">
      <span class="avatar">{{ review.userName.charAt(0) }}</span>
      <div class="body">
        <div class="who">
          <b>{{ review.userName }}</b>
          <span style="color:var(--sub);">{{ review.department }}</span>
          <span class="stars">
            <svg viewBox="0 0 24 24" style="fill: var(--star)"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z" /></svg>{{ review.rating.toFixed(1) }}
          </span>
          <template v-if="isMine(review) && editingId !== review.id">
            <button type="button" class="mini-act" @click="startEdit(review)">수정</button>
            <button type="button" class="mini-act" @click="removeReview(review)">삭제</button>
          </template>
        </div>

        <div v-if="editingId === review.id" class="edit-zone">
          <ReviewStarRating v-model="editRating" />
          <input v-model="editContent" class="input" placeholder="한줄 리뷰" @keyup.enter="saveEdit(review)" />
          <div class="edit-acts">
            <button type="button" class="btn sm" :disabled="busy" @click="cancelEdit">취소</button>
            <button type="button" class="btn primary sm" :disabled="busy || !editContent.trim()" @click="saveEdit(review)">저장</button>
          </div>
        </div>
        <div v-else class="txt">{{ review.content }}</div>
      </div>
      <button type="button" class="vote" :class="{ on: review.votedByMe }" @click="toggleVote(review)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 22V11L12 2c1.5 0 2.5 1 2.5 2.5V9H20c1.3 0 2.2 1.2 2 2.5l-1.3 8A2 2 0 0 1 18.7 21H7z" /><path d="M7 11H3v11h4" /></svg>
        {{ review.voteCount }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.hint { color: var(--sub); font-size: 14px; padding: 12px 0; }
.review { display: flex; gap: 13px; padding: 15px 2px; border-bottom: 1px solid var(--line); }
.review:last-child { border-bottom: 0; }
.review .body { flex: 1; min-width: 0; }
.review .who { font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.review .who b { font-size: 13.5px; }
.review .who .stars svg { width: 11px; height: 11px; }
.review .txt { font-size: 14.5px; line-height: 1.6; color: var(--text-2); }
.mini-act { border: 0; background: none; font: inherit; font-size: 12px; color: var(--sub); cursor: pointer; padding: 0 2px; text-decoration: underline; }
.mini-act:hover { color: var(--red); }
.edit-zone { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.edit-zone :deep(.star-rating) svg { width: 18px; height: 18px; }
.edit-acts { display: flex; gap: 8px; }
.vote { align-self: center; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--line-strong); border-radius: 3px; padding: 7px 12px; cursor: pointer; background: transparent; font: inherit; color: var(--sub); font-size: 12px; }
.vote:hover { background: var(--hover); }
.vote.on { border-color: var(--red); color: var(--red); background: var(--red-tint); font-weight: 700; }
</style>
