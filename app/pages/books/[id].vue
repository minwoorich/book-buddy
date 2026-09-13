<script setup lang="ts">
import type { Book, Wishlist } from '#shared/types'

type BookDetail = Book & {
  status: 'available' | 'loaned'
  dueAt?: string
  waitingCount: number
  reservedForUserId?: number
  avgRating: number | null
  reviewCount: number
  wishCount: number
  myState?: { myActiveLoanId: number | null; wished: boolean }
}

const route = useRoute()
const api = useApi()

const bookId = computed(() => Number(route.params.id))
const focusReview = computed(() => route.query.review === '1')

const { data: book, refresh: refreshBook } = await useAsyncData<BookDetail>(
  'book-detail',
  () => api<BookDetail>(`/api/books/${bookId.value}`),
  { watch: [bookId] }
)

const reviewListRef = ref<{ refresh: () => Promise<void> } | null>(null)

function onReviewCreated() {
  reviewListRef.value?.refresh()
  refreshBook()
}

const myLoanId = computed(() => book.value?.myState?.myActiveLoanId ?? null)

const pubDateLabel = computed(() => {
  const raw = book.value?.pubDate
  if (!raw) return null
  const m = raw.match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}. ${m[2]}.` : raw
})

const loanBusy = ref(false)

async function borrow() {
  if (!book.value || loanBusy.value) return
  loanBusy.value = true
  try {
    await api('/api/loans', { method: 'POST', body: { bookId: bookId.value } })
    await refreshBook()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    loanBusy.value = false
  }
}

async function returnLoan() {
  const loanId = myLoanId.value
  if (!loanId || loanBusy.value) return
  loanBusy.value = true
  try {
    await api(`/api/loans/${loanId}`, { method: 'PATCH', body: { returned: true } })
    await refreshBook()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    loanBusy.value = false
  }
}

async function reserve() {
  if (!book.value || loanBusy.value) return
  loanBusy.value = true
  try {
    await api('/api/reservations', { method: 'POST', body: { bookId: bookId.value } })
    await refreshBook()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    loanBusy.value = false
  }
}

const wishBusy = ref(false)

async function findWishlistId(): Promise<number | null> {
  const list = await api<Wishlist[]>('/api/wishlists')
  return list.find((w) => w.bookId === bookId.value)?.id ?? null
}

async function toggleWish() {
  if (!book.value || wishBusy.value) return
  wishBusy.value = true
  try {
    if (book.value.myState?.wished) {
      const id = await findWishlistId()
      if (id) await api(`/api/wishlists/${id}`, { method: 'DELETE' })
    } else {
      await api('/api/wishlists', { method: 'POST', body: { bookId: bookId.value } })
    }
    await refreshBook()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    wishBusy.value = false
  }
}

async function reportIssue() {
  const reason = window.prompt('분실·파손 사유를 알려주세요')
  if (!reason || !reason.trim()) return
  try {
    await api('/api/reports', {
      method: 'POST',
      body: { targetType: 'book', targetId: bookId.value, reason: reason.trim() },
    })
    alert('접수됐어요')
  } catch (e) {
    alert(apiErrorMessage(e))
  }
}

function askAi() {
  // Task 14: chatOpenWith(bookId)로 연결 예정
}
</script>

<template>
  <div>
    <CommonAppHeader active="home" />
    <div v-if="!book" class="wrap">
      <p class="hint">책을 찾을 수 없어요.</p>
    </div>
    <div v-else class="wrap">
      <div class="crumb">
        <NuxtLink to="/">홈</NuxtLink> &nbsp;/&nbsp; <span>{{ book.category }}</span> &nbsp;/&nbsp; {{ book.title }}
      </div>

      <div class="layout">
        <div class="left">
          <BookCoverImage :src="book.coverUrl" :alt="book.title" />
          <BookStatusBadge :status="book.status" :waiting-count="book.waitingCount" />

          <button
            v-if="book.status === 'available' && myLoanId === null"
            type="button"
            class="btn primary"
            :disabled="loanBusy"
            @click="borrow"
          >대출하기</button>
          <button
            v-else-if="myLoanId !== null"
            type="button"
            class="btn"
            :disabled="loanBusy"
            @click="returnLoan"
          >반납하기</button>
          <button v-else type="button" class="btn" :disabled="loanBusy" @click="reserve">예약하기</button>

          <button type="button" class="btn" :disabled="wishBusy" @click="toggleWish">
            <svg width="14" height="14" viewBox="0 0 24 24" :fill="book.myState?.wished ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><path d="M12 21C7 16.5 3 13.3 3 9.2 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.2 0 4.1-4 7.3-9 11.8z" /></svg>
            {{ book.myState?.wished ? '찜 해제' : '찜하기' }} <span style="color:var(--sub); font-weight:500;">· {{ book.wishCount }}</span>
          </button>

          <div class="aux">
            <span />
            <a href="#" @click.prevent="reportIssue">분실·파손 신고</a>
          </div>
        </div>

        <div class="right">
          <span class="chip cat-chip">{{ book.category }}</span>
          <h1>{{ book.title }}</h1>
          <div class="byline">{{ book.author }} 지음</div>
          <div class="metaline">
            <span v-if="book.publisher">{{ book.publisher }}</span>
            <span v-if="pubDateLabel">{{ pubDateLabel }}</span>
            <span v-if="book.pageCount">{{ book.pageCount }}쪽</span>
            <span v-if="book.isbn13">ISBN {{ book.isbn13 }}</span>
          </div>
          <div class="rating">
            <template v-if="book.avgRating !== null">
              <b>{{ book.avgRating.toFixed(1) }}</b>
              <ReviewStarRating :model-value="book.avgRating" readonly />
              <span style="font-size:13px; color:var(--sub);">리뷰 {{ book.reviewCount }}개</span>
            </template>
            <span v-else style="font-size:13px; color:var(--sub);">아직 리뷰가 없어요</span>
          </div>
          <p v-if="book.description" class="desc">{{ book.description }}</p>

          <div class="panel accent ai-mini">
            <i>AI LIBRARIAN</i>
            <button type="button" class="btn" @click="askAi">AI에게 이 책 물어보기</button>
          </div>

          <div class="sec-head" style="margin-top:0;">
            <h2>리뷰 <span style="font-family:Pretendard,sans-serif; font-size:14px; color:var(--sub); font-weight:500;">{{ book.reviewCount }}</span></h2>
            <div class="rule" />
          </div>

          <ReviewForm :book-id="bookId" :autofocus="focusReview" @created="onReviewCreated" />
          <ReviewList ref="reviewListRef" :book-id="bookId" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint { color: var(--sub); font-size: 14px; padding: 20px 0; }
.crumb { font-size: 13px; color: var(--sub); margin-bottom: 24px; }
.crumb a { color: var(--sub); }
.layout { display: flex; gap: 44px; align-items: flex-start; }
.left { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }
.left :deep(.cv) { width: 250px; aspect-ratio: 500/726; }
.left .btn { width: 100%; padding: 12px; font-size: 14.5px; }
.aux { display: flex; justify-content: flex-end; align-items: center; font-size: 12.5px; color: var(--sub); }
.aux a { color: var(--sub); text-decoration: underline; }
.right { flex: 1; min-width: 0; }
.right h1 { font-family: "Noto Serif KR", serif; font-size: 29px; font-weight: 600; margin: 8px 0 6px; letter-spacing: -0.3px; }
.cat-chip { cursor: default; }
.byline { font-size: 15px; color: var(--sub); margin-bottom: 10px; }
.metaline { display: flex; gap: 14px; font-size: 13px; color: var(--sub); margin-bottom: 14px; flex-wrap: wrap; }
.rating { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.rating b { font-size: 20px; }
.rating :deep(.star-rating) svg { width: 16px; height: 16px; }
.desc { font-size: 15px; line-height: 1.8; color: #464034; margin: 0 0 24px; }
.ai-mini { display: flex; align-items: center; gap: 14px; margin-bottom: 34px; }
.ai-mini i { flex: 1; font-style: normal; font-size: 11px; letter-spacing: 2px; color: var(--red); font-weight: 700; }
.ai-mini .btn { white-space: nowrap; }
</style>
