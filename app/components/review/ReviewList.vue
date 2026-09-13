<script setup lang="ts">
import type { Review } from '#shared/types'

type ReviewWithMeta = Review & {
  userName: string
  department: string
  voteCount: number
  votedByMe: boolean
}

const props = defineProps<{ bookId: number }>()

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
            <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z" /></svg>{{ review.rating.toFixed(1) }}
          </span>
        </div>
        <div class="txt">{{ review.content }}</div>
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
.review .body { flex: 1; }
.review .who { font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.review .who b { font-size: 13.5px; }
.review .who .stars svg { width: 11px; height: 11px; }
.review .txt { font-size: 14.5px; line-height: 1.6; color: #3E382D; }
.vote { align-self: center; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--line-strong); border-radius: 3px; padding: 7px 12px; cursor: pointer; background: transparent; font: inherit; color: var(--sub); font-size: 12px; }
.vote:hover { background: #F1EADD; }
.vote.on { border-color: var(--red); color: var(--red); background: var(--red-tint); font-weight: 700; }
</style>
