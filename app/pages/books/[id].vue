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
  myState?: { myActiveLoanId: number | null; wished: boolean; reservedByMe?: boolean }
}

const route = useRoute()
const api = useApi()
const { user } = useCurrentUser()

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

// 반납됐지만 다른 사람이 먼저 예약해둔 책인지(= 내가 그 예약자가 아닌지). SSR 등 비로그인
// 상태(user.value===undefined)에서도 안전하게 false/true를 결정할 수 있어야 한다.
const isReservedForOther = computed(() => {
  const reservedFor = book.value?.reservedForUserId
  if (reservedFor == null) return false
  return reservedFor !== user.value?.id
})

type LoanAction = 'borrow' | 'reserved-wait' | 'return' | 'reserve' | 'reserved-by-me'

const loanAction = computed<LoanAction>(() => {
  if (myLoanId.value !== null) return 'return'
  if (book.value?.status === 'available') {
    // 반납된 책이 내 예약 차례면 reservedByMe여도 바로 대출 버튼을 보여준다.
    return isReservedForOther.value ? 'reserved-wait' : 'borrow'
  }
  if (book.value?.myState?.reservedByMe) return 'reserved-by-me'
  return 'reserve'
})

// 카카오 책 API의 contents는 원문에서 일정 길이로 잘려 온다(전문 미제공). 문장이 중간에
// 끊긴 채 그대로 보이면 버그처럼 읽히므로(QA #14), 끝맺음 문장부호 없이 끝나면 말줄임표를 붙인다.
const descriptionLabel = computed(() => {
  const raw = book.value?.description?.trim()
  if (!raw) return ''
  return /[.!?"'」』)\]…]$/.test(raw) ? raw : `${raw}…`
})

const pubDateLabel = computed(() => {
  const raw = book.value?.pubDate
  if (!raw) return null
  const m = raw.match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}. ${m[2]}.` : raw
})

const loanBusy = ref(false)

async function borrow() {
  if (!user.value) return navigateTo('/login')
  if (!book.value || loanBusy.value) return
  if (!confirm(`『${book.value.title}』을(를) 대출할까요?\n반납 기한은 14일이에요.`)) return
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
  if (!user.value) return navigateTo('/login')
  const loanId = myLoanId.value
  if (!loanId || loanBusy.value) return
  if (!confirm(`『${book.value?.title}』을(를) 반납할까요?`)) return
  loanBusy.value = true
  try {
    const res = await api<{ canceled?: boolean }>(`/api/loans/${loanId}`, {
      method: 'PATCH',
      body: { returned: true },
    })
    if (res.canceled) alert('대출한 지 30분이 안 돼서, 완독이 아닌 대출 취소로 처리했어요.')
    await refreshBook()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    loanBusy.value = false
  }
}

async function reserve() {
  if (!user.value) return navigateTo('/login')
  if (!book.value || loanBusy.value) return
  if (!confirm(`『${book.value.title}』을(를) 예약할까요?\n지금 대출 중인 책이라, 반납되면 순서대로 안내해드려요.`)) return
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

// 찜/찜 해제 후 잠깐 보여주는 토스트(QA #22).
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(text: string) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2200)
}
onBeforeUnmount(() => clearTimeout(toastTimer))

async function findWishlistId(): Promise<number | null> {
  const list = await api<Wishlist[]>('/api/wishlists')
  return list.find((w) => w.bookId === bookId.value)?.id ?? null
}

async function toggleWish() {
  if (!user.value) return navigateTo('/login')
  if (!book.value || wishBusy.value) return
  wishBusy.value = true
  try {
    if (book.value.myState?.wished) {
      const id = await findWishlistId()
      if (id) await api(`/api/wishlists/${id}`, { method: 'DELETE' })
      showToast('찜을 해제했어요')
    } else {
      await api('/api/wishlists', { method: 'POST', body: { bookId: bookId.value } })
      showToast('찜했어요 ❤ 내 서재의 찜한 책에서 볼 수 있어요')
    }
    await refreshBook()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    wishBusy.value = false
  }
}

// 분실·파손 신고 — window.prompt는 브라우저가 도메인 주소를 제목으로 띄워 어색해서(QA #24)
// 자체 모달로 입력받는다.
const reportOpen = ref(false)
const reportReason = ref('')
const reportBusy = ref(false)

function openReport() {
  if (!user.value) return navigateTo('/login')
  reportReason.value = ''
  reportOpen.value = true
}

async function submitReport() {
  const reason = reportReason.value.trim()
  if (!reason || reportBusy.value) return
  reportBusy.value = true
  try {
    await api('/api/reports', {
      method: 'POST',
      body: { targetType: 'book', targetId: bookId.value, reason },
    })
    reportOpen.value = false
    showToast('신고가 접수됐어요. 확인 후 조치할게요.')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    reportBusy.value = false
  }
}

const { openWith } = useChat()

function askAi() {
  openWith(bookId.value)
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
            v-if="loanAction === 'borrow'"
            type="button"
            class="btn primary"
            :disabled="loanBusy"
            @click="borrow"
          >대출하기</button>
          <template v-else-if="loanAction === 'reserved-wait'">
            <button type="button" class="btn" disabled>예약자 대기 중</button>
            <p class="reserved-hint">반납된 책을 예약자가 먼저 대출할 수 있어요</p>
          </template>
          <button
            v-else-if="loanAction === 'return'"
            type="button"
            class="btn"
            :disabled="loanBusy"
            @click="returnLoan"
          >반납하기</button>
          <template v-else-if="loanAction === 'reserved-by-me'">
            <button type="button" class="btn" disabled>예약 중</button>
            <p class="reserved-hint">반납되면 알려드려요 — 예약 취소는 <NuxtLink to="/my">내 서재</NuxtLink>에서</p>
          </template>
          <button v-else type="button" class="btn" :disabled="loanBusy" @click="reserve">예약하기</button>

          <button type="button" class="btn" :disabled="wishBusy" @click="toggleWish">
            <svg width="14" height="14" viewBox="0 0 24 24" :fill="book.myState?.wished ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><path d="M12 21C7 16.5 3 13.3 3 9.2 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.2 0 4.1-4 7.3-9 11.8z" /></svg>
            {{ book.myState?.wished ? '찜 해제' : '찜하기' }} <span style="color:var(--sub); font-weight:500;">· {{ book.wishCount }}</span>
          </button>

          <div class="aux">
            <span />
            <a href="#" @click.prevent="openReport">분실·파손 신고</a>
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
          <p v-if="descriptionLabel" class="desc">{{ descriptionLabel }}</p>

          <div class="panel accent ai-mini">
            <i>책벗 · AI</i>
            <button type="button" class="btn" @click="askAi">책벗에게 이 책 물어보기</button>
          </div>

          <div class="sec-head" style="margin-top:0;">
            <h2>리뷰 <span style="font-family:Pretendard,sans-serif; font-size:14px; color:var(--sub); font-weight:500;">{{ book.reviewCount }}</span></h2>
            <div class="rule" />
          </div>

          <p v-if="!user" class="guest-review-hint">로그인 후 리뷰를 남길 수 있어요</p>
          <ReviewForm v-else :book-id="bookId" :autofocus="focusReview" @created="onReviewCreated" />
          <ReviewList ref="reviewListRef" :book-id="bookId" @changed="refreshBook" />
        </div>
      </div>

      <transition name="toast">
        <div v-if="toast" class="toast">{{ toast }}</div>
      </transition>

      <div v-if="reportOpen" class="modal-back" @click.self="reportOpen = false">
        <div class="modal">
          <b>분실·파손 신고</b>
          <p>『{{ book.title }}』에 어떤 문제가 있나요?</p>
          <textarea
            v-model="reportReason"
            rows="3"
            placeholder="예: 표지가 찢어져 있어요 / 서가에서 찾을 수 없어요"
          ></textarea>
          <div class="modal-acts">
            <button type="button" class="btn sm" :disabled="reportBusy" @click="reportOpen = false">취소</button>
            <button type="button" class="btn primary sm" :disabled="reportBusy || !reportReason.trim()" @click="submitReport">
              {{ reportBusy ? '접수 중...' : '신고하기' }}
            </button>
          </div>
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
.left .btn:disabled { cursor: not-allowed; opacity: .65; }
.reserved-hint { margin: -8px 0 0; font-size: 12px; color: var(--sub); line-height: 1.4; }
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
.guest-review-hint { font-size: 13.5px; color: var(--sub); margin: 0 0 18px; }

.toast {
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%);
  background: var(--ink); color: #fff; font-size: 13.5px; font-weight: 600;
  border-radius: 999px; padding: 11px 20px; box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 90;
  white-space: nowrap;
}
.toast-enter-active, .toast-leave-active { transition: opacity .25s, transform .25s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

.modal-back {
  position: fixed; inset: 0; background: rgba(40, 32, 18, .45); z-index: 95;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal {
  width: 380px; max-width: 100%; background: var(--card); border: 1px solid var(--line-strong);
  border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 24px 60px rgba(60,48,28,.35);
}
.modal b { font-size: 15.5px; }
.modal p { margin: 0; font-size: 13px; color: var(--sub); }
.modal textarea {
  font: inherit; font-size: 13.5px; color: var(--ink); background: var(--bg);
  border: 1px solid var(--line-strong); border-radius: 6px; padding: 9px 11px; resize: none; outline: 0;
}
.modal textarea:focus { border-color: var(--red); }
.modal-acts { display: flex; justify-content: flex-end; gap: 8px; }
</style>
