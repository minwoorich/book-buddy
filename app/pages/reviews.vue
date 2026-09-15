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

type Sort = 'popular' | 'latest'

const api = useApi()
const { user } = useCurrentUser()

const sort = ref<Sort>('popular')

const SORTS: { key: Sort; label: string }[] = [
  { key: 'popular', label: '추천순' },
  { key: 'latest', label: '최신순' },
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

/** 별점을 채워진/빈 별 5개 배열로 — 왓챠피디아식 코멘트처럼 별을 직접 그린다. */
function starFills(rating: number): boolean[] {
  return Array.from({ length: 5 }, (_, i) => i < Math.round(rating))
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
          <p>동료들이 남긴 한줄 평을 한곳에서 — 마음에 들면 추천을 눌러주세요</p>
        </div>
      </div>

      <div class="feed-shell">
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
        <div v-else class="feed">
          <div v-for="review in reviews" :key="review.id" class="row">
            <NuxtLink class="cover-link" :to="`/books/${review.bookId}`">
              <BookCoverImage :src="review.bookCoverUrl" :alt="review.bookTitle" />
            </NuxtLink>

            <div class="row-body">
              <div class="row-top">
                <span class="avatar">{{ review.userName.charAt(0) }}</span>
                <b class="name">{{ review.userName }}</b>
                <span v-if="isMine(review)" class="badge red">나</span>
                <span class="dept">{{ review.department }}</span>
                <span class="when">{{ whenLabel(review.createdAt) }}</span>
              </div>

              <div class="stars" :aria-label="`별점 ${review.rating}점`">
                <svg
                  v-for="(filled, i) in starFills(review.rating)"
                  :key="i"
                  width="14" height="14" viewBox="0 0 24 24"
                  :fill="filled ? '#C9A227' : 'none'"
                  :stroke="filled ? '#C9A227' : '#C9BCA2'"
                  stroke-width="1.5"
                ><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z" /></svg>
                <span class="stars-num">{{ review.rating.toFixed(1) }}</span>
              </div>

              <p class="content">{{ review.content }}</p>

              <div class="row-foot">
                <NuxtLink class="book-tag" :to="`/books/${review.bookId}`">
                  {{ review.bookTitle }} <span class="book-author">· {{ review.bookAuthor }}</span>
                </NuxtLink>
                <button
                  type="button"
                  class="vote"
                  :class="{ on: review.votedByMe }"
                  :disabled="voteBusyId === review.id"
                  @click="toggleVote(review)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 22V11L12 2c1.5 0 2.5 1 2.5 2.5V9H20c1.3 0 2.2 1.2 2 2.5l-1.3 8A2 2 0 0 1 18.7 21H7z" /><path d="M7 11H3v11h4" /></svg>
                  추천 {{ review.voteCount }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 제목과 목록 사이를 넉넉히 띄우고(QA #63·#67), 평균 별점 요약은 뺐다(QA #63·#67). */
.head-row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 36px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }

/* 왓챠피디아 코멘트 피드처럼 카드 그리드 대신 가운데 정렬된 단일 목록으로 쌓는다 —
   격자에서 카드 높이가 제각각이라 줄이 삐뚤빼뚤해지는 문제를 원천적으로 없앤다. */
.feed-shell { max-width: 760px; margin: 0 auto; }
/* 정렬 칩은 오른쪽으로 몰아 목록 첫 줄과 맞춘다(QA #67). */
.sorts { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 10px; }

.feed { display: flex; flex-direction: column; }
.row { display: flex; gap: 16px; padding: 22px 4px; border-bottom: 1px solid var(--line); }
.row:first-child { padding-top: 6px; }
.row:last-child { border-bottom: 0; }

.cover-link { flex-shrink: 0; }
.cover-link :deep(.cv) { width: 58px; height: 84px; }

.row-body { flex: 1; min-width: 0; }
.row-top { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; flex-wrap: wrap; }
.avatar { width: 24px; height: 24px; font-size: 11px; flex-shrink: 0; }
.row-top .name { font-size: 13.5px; }
.row-top .dept { font-size: 12px; color: var(--sub); }
.row-top .when { margin-left: auto; font-size: 12px; color: var(--sub); }

.stars { display: flex; align-items: center; gap: 2px; margin-bottom: 9px; }
.stars-num { margin-left: 4px; font-size: 12.5px; font-weight: 700; color: #A8841C; }

.content { margin: 0 0 12px; font-size: 15px; line-height: 1.7; color: #3E382D; }

.row-foot { display: flex; align-items: center; gap: 14px; }
.book-tag {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12.5px; font-weight: 700; color: var(--sub); text-decoration: none;
}
.book-tag:hover { color: var(--red); }
.book-tag .book-author { font-weight: 500; }

.vote {
  margin-left: auto; flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12.5px; font-weight: 700; color: var(--sub);
  background: transparent; border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 5px 12px; cursor: pointer;
}
.vote:hover { background: #F1EADD; }
.vote.on { border-color: var(--red); color: var(--red); background: var(--red-tint); }
.vote:disabled { opacity: .6; cursor: default; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; text-align: center; }

@media (max-width: 700px) {
  .head-row { flex-direction: column; align-items: flex-start; margin-bottom: 26px; padding-bottom: 14px; }
  .sorts { justify-content: flex-start; }
  .row-top .when { margin-left: 0; width: 100%; order: 1; }
}
</style>
