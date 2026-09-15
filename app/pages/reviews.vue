<script setup lang="ts">
import type { Review } from '#shared/types'

type ReviewCard = Review & {
  userName: string
  department: string
  voteCount: number
  votedByMe: boolean
  bookTitle: string
  bookAuthor: string
  bookCoverUrl: string | null
}

type Sort = 'popular' | 'latest' | 'rating'

const api = useApi()
const { user } = useCurrentUser()

const sort = ref<Sort>('popular')

const SORTS: { key: Sort; label: string }[] = [
  { key: 'popular', label: '추천순' },
  { key: 'latest', label: '최신순' },
  { key: 'rating', label: '별점순' },
]

const { data, refresh } = await useAsyncData<{ stats: { count: number; avg: number | null }; reviews: ReviewCard[] }>(
  'all-reviews',
  () =>
    user.value
      ? api<{ stats: { count: number; avg: number | null }; reviews: ReviewCard[] }>('/api/reviews', {
          query: { scope: 'all', sort: sort.value },
        })
      : Promise.resolve({ stats: { count: 0, avg: null }, reviews: [] }),
  { watch: [sort], default: () => ({ stats: { count: 0, avg: null }, reviews: [] }) }
)

const reviews = computed(() => data.value.reviews)
const stats = computed(() => data.value.stats)

const voteBusyId = ref<number | null>(null)

async function toggleVote(review: ReviewCard) {
  if (voteBusyId.value !== null) return
  voteBusyId.value = review.id
  try {
    if (review.votedByMe) {
      await api(`/api/reviews/${review.id}/votes`, { method: 'DELETE' })
    } else {
      await api(`/api/reviews/${review.id}/votes`, { method: 'POST' })
    }
    await refresh()
  } catch (e) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    if (statusCode === 409) {
      await refresh()
    } else {
      alert(apiErrorMessage(e))
    }
  } finally {
    voteBusyId.value = null
  }
}

function isMine(review: ReviewCard): boolean {
  return !!user.value && review.userId === user.value.id
}

function whenLabel(iso: string): string {
  const d = parseDbDate(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}
</script>

<template>
  <div>
    <CommonAppHeader active="reviews" />
    <div class="wrap">
      <div class="head-row">
        <div class="page-head" style="margin-bottom:0;">
          <span class="eyebrow">EVERYONE'S COMMENTS</span>
          <h1>리뷰 모아보기</h1>
          <p>동료들이 남긴 한줄 평을 한곳에서 — 마음에 들면 👍 추천을 눌러주세요</p>
        </div>
        <div class="summary">
          <div class="avg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z" /></svg>
            <b>{{ stats.avg !== null ? stats.avg.toFixed(1) : '-' }}</b>
          </div>
          <span>리뷰 {{ stats.count }}개의 평균 별점</span>
        </div>
      </div>

      <div class="sorts">
        <span
          v-for="s in SORTS"
          :key="s.key"
          class="chip"
          :class="{ on: sort === s.key }"
          @click="sort = s.key"
        >{{ s.label }}</span>
      </div>

      <p v-if="!reviews.length" class="hint">아직 리뷰가 없어요. 첫 리뷰의 주인공이 되어보세요.</p>
      <div v-else class="cards">
        <div v-for="review in reviews" :key="review.id" class="card">
          <div class="card-head">
            <span class="avatar">{{ review.userName.charAt(0) }}</span>
            <div class="who">
              <b>{{ review.userName }} <span v-if="isMine(review)" class="badge red">나</span></b>
              <span>{{ review.department }}</span>
            </div>
            <span class="star-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z" /></svg>
              {{ review.rating.toFixed(1) }}
            </span>
          </div>

          <p class="content">{{ review.content }}</p>

          <NuxtLink class="book" :to="`/books/${review.bookId}`">
            <BookCoverImage :src="review.bookCoverUrl" :alt="review.bookTitle" />
            <span class="book-info">
              <b>{{ review.bookTitle }}</b>
              <i>{{ review.bookAuthor }}</i>
            </span>
            <span class="go">›</span>
          </NuxtLink>

          <div class="card-foot">
            <button
              type="button"
              class="vote"
              :class="{ on: review.votedByMe }"
              :disabled="voteBusyId === review.id"
              @click="toggleVote(review)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 22V11L12 2c1.5 0 2.5 1 2.5 2.5V9H20c1.3 0 2.2 1.2 2 2.5l-1.3 8A2 2 0 0 1 18.7 21H7z" /><path d="M7 11H3v11h4" /></svg>
              추천 {{ review.voteCount }}
            </button>
            <span class="when">{{ whenLabel(review.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 18px; }

.summary { margin-left: auto; text-align: right; }
.summary .avg { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.summary .avg b { font-family: "Noto Serif KR", serif; font-size: 26px; }
.summary > span { font-size: 12.5px; color: var(--sub); }

.sorts { display: flex; gap: 8px; margin-bottom: 22px; }

.cards { column-count: 3; column-gap: 20px; }
.card {
  break-inside: avoid; margin-bottom: 20px;
  background: var(--card); border: 1px solid var(--line); border-radius: 8px;
  padding: 16px 18px; box-shadow: 0 2px 10px rgba(84, 70, 45, .06);
  display: flex; flex-direction: column; gap: 12px;
}

.card-head { display: flex; align-items: center; gap: 10px; }
.card-head .who { min-width: 0; }
.card-head .who b { font-size: 13.5px; display: block; }
.card-head .who > span { font-size: 11.5px; color: var(--sub); }
.star-chip {
  margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
  font-size: 12.5px; font-weight: 800; color: #A8841C;
  background: #F7EFD8; border-radius: 999px; padding: 4px 10px;
}

.content { margin: 0; font-size: 14.5px; line-height: 1.7; color: #3E382D; }

.book {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  padding: 9px 12px 9px 9px; text-decoration: none; color: inherit;
}
.book:hover { border-color: #C9BCA2; }
.book :deep(.cv) { width: 32px; height: 46px; flex-shrink: 0; }
.book-info { min-width: 0; }
.book-info b { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.book-info i { font-style: normal; font-size: 11.5px; color: var(--sub); }
.book .go { margin-left: auto; color: var(--sub); font-size: 16px; }

.card-foot { display: flex; align-items: center; border-top: 1px solid var(--line); padding-top: 11px; }
.vote {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12.5px; font-weight: 700; color: var(--sub);
  background: transparent; border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 6px 13px; cursor: pointer;
}
.vote:hover { background: #F1EADD; }
.vote.on { border-color: var(--red); color: var(--red); background: var(--red-tint); }
.vote:disabled { opacity: .6; cursor: default; }
.card-foot .when { margin-left: auto; font-size: 12px; color: var(--sub); }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 1100px) {
  .cards { column-count: 2; }
}
@media (max-width: 700px) {
  .cards { column-count: 1; }
  .head-row { flex-direction: column; align-items: flex-start; }
  .summary { margin-left: 0; text-align: left; }
}
</style>
