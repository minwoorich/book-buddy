<script setup lang="ts">
import type { Book, Loan, PurchaseRequest, RankRow, RankSnapshot, Reservation, Review, Wishlist } from '#shared/types'

type LoanWithBook = Loan & { book: Book }
type WishlistWithBook = Wishlist & { book: Book }
type ReservationWithBook = Reservation & { book: Book; queueRank: number }

const api = useApi()
const { user } = useCurrentUser()

const { data: activeLoans, refresh: refreshActive } = await useAsyncData<LoanWithBook[]>(
  'my-active-loans',
  () => (user.value ? api<LoanWithBook[]>('/api/loans', { query: { active: true } }) : Promise.resolve([])),
  { default: () => [] }
)

const { data: doneLoans, refresh: refreshDone } = await useAsyncData<LoanWithBook[]>(
  'my-done-loans',
  () => (user.value ? api<LoanWithBook[]>('/api/loans', { query: { returned: true } }) : Promise.resolve([])),
  { default: () => [] }
)

const { data: wishlists, refresh: refreshWishlists } = await useAsyncData<WishlistWithBook[]>(
  'my-wishlists',
  () => (user.value ? api<WishlistWithBook[]>('/api/wishlists') : Promise.resolve([])),
  { default: () => [] }
)

const { data: reservations, refresh: refreshReservations } = await useAsyncData<ReservationWithBook[]>(
  'my-reservations',
  () => (user.value ? api<ReservationWithBook[]>('/api/reservations') : Promise.resolve([])),
  { default: () => [] }
)

const { data: purchaseRequests, refresh: refreshPurchaseRequests } = await useAsyncData<PurchaseRequest[]>(
  'my-purchase-requests',
  () => (user.value ? api<PurchaseRequest[]>('/api/purchase-requests') : Promise.resolve([])),
  { default: () => [] }
)

const { data: userRankings } = await useAsyncData<RankRow[]>(
  'my-rankings',
  () =>
    user.value
      ? api<RankSnapshot>('/api/rankings', { query: { by: 'user' } }).then((snap) => snap.rows)
      : Promise.resolve([]),
  { default: () => [] }
)

type MyReview = Review & { bookTitle: string; bookCoverUrl: string | null }

const { data: myReviews, refresh: refreshMyReviews } = await useAsyncData<MyReview[]>(
  'my-reviews-list',
  () => (user.value ? api<MyReview[]>('/api/reviews') : Promise.resolve([])),
  { default: () => [] }
)

// 표준 경쟁 순위(1224식): count가 같으면 같은 순위, 다음 순위는 동률 인원수만큼 건너뛴다.
// rankings.vue와 동일한 규칙(스펙: '동률은 공동 순위').
function competitionRankAt(list: RankRow[], idx: number): number {
  let rank = idx + 1
  while (rank > 1 && list[rank - 2].count === list[idx].count) rank--
  return rank
}

const myRank = computed(() => {
  if (!user.value) return null
  const list = userRankings.value ?? []
  const idx = list.findIndex((r) => r.userId === user.value!.id)
  return idx === -1 ? null : competitionRankAt(list, idx)
})

// useAsyncData는 같은 키의 데이터를 세션 내내 캐시하므로, 다른 페이지에서 찜/대출을 바꾸고
// 돌아오면 새로고침 전까지 옛 데이터가 보였다(QA #17). 마이페이지 진입 시마다 다시 불러온다.
onMounted(() => {
  void refreshAll()
})

async function refreshAll() {
  await Promise.all([
    refreshActive(),
    refreshDone(),
    refreshWishlists(),
    refreshReservations(),
    refreshPurchaseRequests(),
    refreshMyReviews(),
  ])
}

// ── 도서 달력(QA #72): 별도 페이지 대신 내 서재 안 섹션. 완독 목록(doneLoans)을 그대로 넘기면
// ReadingCalendar가 날짜별로 알아서 꽂는다. ─────────────────────────────
const calNow = new Date()
const calYear = ref(calNow.getFullYear())
const calMonth = ref(calNow.getMonth() + 1) // 1~12

function prevMonth() {
  if (calMonth.value === 1) {
    calYear.value--
    calMonth.value = 12
  } else {
    calMonth.value--
  }
}

function nextMonth() {
  if (calMonth.value === 12) {
    calYear.value++
    calMonth.value = 1
  } else {
    calMonth.value++
  }
}

const isCurrentMonth = computed(
  () => calYear.value === calNow.getFullYear() && calMonth.value === calNow.getMonth() + 1
)

function goThisMonth() {
  calYear.value = calNow.getFullYear()
  calMonth.value = calNow.getMonth() + 1
}

const monthDoneCount = computed(
  () =>
    (doneLoans.value ?? []).filter((l) => {
      if (!l.returnedAt) return false
      const d = parseDbDate(l.returnedAt)
      return d.getFullYear() === calYear.value && d.getMonth() + 1 === calMonth.value
    }).length
)

// ── 많이 읽은 분야(완독 기준 상위 3개) — QA #25의 "분야 정리" 축소판 ────────
const topCategories = computed(() => {
  const counts = new Map<string, number>()
  for (const l of doneLoans.value ?? []) {
    if (!l.book.category) continue
    counts.set(l.book.category, (counts.get(l.book.category) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
})

// ── 희망도서 직접 신청 폼(QA #30) ─────────────────────────────────
const requestFormOpen = ref(false)
const requestTitle = ref('')
const requestAuthor = ref('')
const requestBusy = ref(false)

async function submitPurchaseRequest() {
  const title = requestTitle.value.trim()
  if (!title || requestBusy.value) return
  requestBusy.value = true
  try {
    await api('/api/purchase-requests', {
      method: 'POST',
      body: { title, author: requestAuthor.value.trim() || undefined },
    })
    requestTitle.value = ''
    requestAuthor.value = ''
    requestFormOpen.value = false
    await refreshPurchaseRequests()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    requestBusy.value = false
  }
}

// ── 읽고 있는 책: 대출일·반납일·D-day ─────────────────────────────
// loanedAt은 DB 기본값(datetime('now'), UTC 'YYYY-MM-DD HH:MM:SS')이라 parseDbDate가
// 필요하다. dueAt은 애플리케이션이 채우는 ISO 문자열이라 parseDbDate를 그대로 써도
// (정규식이 안 맞아 new Date()로 폴백되므로) 동일하게 안전하다 — 두 컬럼 모두 이 헬퍼로 통일.
function formatMD(dateStr: string): string {
  const d = parseDbDate(dateStr)
  return `${d.getMonth() + 1}. ${d.getDate()}.`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const readingRows = computed(() => {
  const today = startOfDay(new Date())
  return (activeLoans.value ?? []).map((loan) => {
    const due = startOfDay(parseDbDate(loan.dueAt))
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000)
    return {
      loan,
      loanedLabel: formatMD(loan.loanedAt),
      dueLabel: formatMD(loan.dueAt),
      over: diffDays < 0,
      days: diffDays,
    }
  })
})

const returnBusyId = ref<number | null>(null)

async function returnLoan(loanId: number) {
  if (returnBusyId.value !== null) return
  const title = activeLoans.value?.find((l) => l.id === loanId)?.book.title
  if (!confirm(`${title ? `『${title}』을(를)` : '이 책을'} 반납할까요?`)) return
  returnBusyId.value = loanId
  try {
    const res = await api<{ canceled?: boolean }>(`/api/loans/${loanId}`, {
      method: 'PATCH',
      body: { returned: true },
    })
    if (res.canceled) alert('대출한 지 30분이 안 돼서, 완독이 아닌 대출 취소로 처리했어요.')
    await refreshAll()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    returnBusyId.value = null
  }
}

// ── 읽은 책 선반 ───────────────────────────────────────────────────
// 같은 책을 여러 번 대출-반납해도 선반에는 한 번만 보여준다(가장 최근 완독 기준) — QA #10.
// 랭킹·책쌓기 집계는 규칙대로 대출-반납 "기록" 수를 세므로 여기서만 중복을 걷어낸다.
const doneSorted = computed(() => {
  const sorted = [...(doneLoans.value ?? [])].sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
  const seen = new Set<number>()
  return sorted.filter((l) => {
    if (seen.has(l.book.id)) return false
    seen.add(l.book.id)
    return true
  })
})
const readBooks = computed(() => doneSorted.value.map((l) => l.book))
const readMetaTexts = computed(() =>
  doneSorted.value.map((l) => {
    if (!l.returnedAt) return ''
    const d = parseDbDate(l.returnedAt)
    return `${d.getMonth() + 1}. ${d.getDate()}. 완독`
  })
)

// ── 찜한 책 선반 ───────────────────────────────────────────────────
const wishBooks = computed(() => (wishlists.value ?? []).map((w) => w.book))
const wishBusy = ref(false)

async function unwish(index: number) {
  const target = wishlists.value?.[index]
  if (!target || wishBusy.value) return
  wishBusy.value = true
  try {
    await api(`/api/wishlists/${target.id}`, { method: 'DELETE' })
    await refreshWishlists()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    wishBusy.value = false
  }
}

// ── 예약 ──────────────────────────────────────────────────────────
const reservationBusyId = ref<number | null>(null)

async function cancelReservation(id: number) {
  if (reservationBusyId.value !== null) return
  reservationBusyId.value = id
  try {
    await api(`/api/reservations/${id}`, { method: 'DELETE' })
    await refreshReservations()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    reservationBusyId.value = null
  }
}

// ── 희망도서 신청 ─────────────────────────────────────────────────
const STATUS_BADGE: Record<PurchaseRequest['status'], { cls: string; label: string }> = {
  requested: { cls: 'warn', label: '대기중' },
  approved: { cls: 'ok', label: '승인됨' },
  rejected: { cls: 'no', label: '거절됨' },
}

function reviewDate(iso: string): string {
  const d = parseDbDate(iso)
  return `${d.getMonth() + 1}. ${d.getDate()}.`
}

function requestMeta(r: PurchaseRequest): string {
  // createdAt도 DB 기본값(datetime('now'))이라 loanedAt/returnedAt과 같은 파싱 버그가
  // 적용된다. 리뷰 지적 범위(loanedAt/returnedAt)엔 없었지만 동일 원인이라 함께 고쳤다.
  const d = parseDbDate(r.createdAt)
  const dateLabel = `${d.getMonth() + 1}. ${d.getDate()}. 신청`
  return r.author ? `${r.author} · ${dateLabel}` : dateLabel
}
</script>

<template>
  <div>
    <CommonAppHeader active="my" />
    <div class="wrap">
      <div class="panel profile" style="margin-bottom: 26px;">
        <span class="avatar lg">{{ user?.name?.charAt(0) ?? '?' }}</span>
        <div class="info">
          <b>{{ user ? `${user.name}의 서재` : '내 서재' }}</b>
          <span v-if="user">
            {{ user.company }} · {{ user.team }} · {{ user.position }}
            &nbsp;·&nbsp; 사내 랭킹
            <NuxtLink to="/rankings">{{ myRank ? `${myRank}위` : '보기' }}</NuxtLink>
          </span>
          <div v-if="topCategories.length" class="fav-cats">
            <span class="fav-label">많이 읽은 분야</span>
            <span v-for="[cat, cnt] in topCategories" :key="cat" class="badge">{{ cat }} {{ cnt }}권</span>
          </div>
        </div>
        <ReadingBookStack :done-loans="doneLoans ?? []" />
      </div>

      <div class="sec-head" style="margin-top:0;">
        <h2>읽고 있는 책</h2>
        <div class="rule" />
      </div>
      <div class="panel" style="padding: 6px 22px;">
        <div v-if="!readingRows.length" class="hint">지금 읽고 있는 책이 없어요.</div>
        <div v-for="row in readingRows" :key="row.loan.id" class="reading-row">
          <BookCoverImage :src="row.loan.book.coverUrl" :alt="row.loan.book.title" />
          <div>
            <div class="t">{{ row.loan.book.title }}</div>
            <div class="a">{{ row.loan.book.author }}</div>
          </div>
          <span class="due" :class="{ over: row.over }">
            {{ row.loanedLabel }} 대출 · 반납일 {{ row.dueLabel }}
            <template v-if="row.over">(연체 {{ -row.days }}일)</template>
            <b v-else style="color:var(--ink);">(D-{{ row.days }})</b>
          </span>
          <button
            type="button"
            class="btn sm"
            :disabled="returnBusyId === row.loan.id"
            @click="returnLoan(row.loan.id)"
          >반납</button>
        </div>
      </div>

      <BookShelfSection
        title="읽은 책"
        :books="readBooks"
        :meta-texts="readMetaTexts"
        empty-text="아직 완독한 책이 없어요."
      />

      <BookShelfSection
        title="찜한 책"
        :books="wishBooks"
        action-label="찜 해제"
        empty-text="찜한 책이 없어요."
        @action="unwish"
      />

      <div class="cols2" style="margin-top: 40px;">
        <div>
          <div class="sec-head" style="margin-top:0;">
            <h2>예약</h2>
            <div class="rule" />
          </div>
          <div class="panel" style="padding: 6px 20px;">
            <div v-if="!reservations?.length" class="hint">예약 중인 책이 없어요.</div>
            <div v-for="r in reservations" :key="r.id" class="mini-row">
              <BookCoverImage :src="r.book.coverUrl" :alt="r.book.title" />
              <div style="flex:1;">
                <b style="font-size:14px;">{{ r.book.title }}</b>
                <div style="font-size:12.5px; color:var(--sub);">예약 {{ r.queueRank }}순위 · 반납되면 알려드려요</div>
              </div>
              <button
                type="button"
                class="btn sm"
                :disabled="reservationBusyId === r.id"
                @click="cancelReservation(r.id)"
              >예약 취소</button>
            </div>
          </div>
        </div>
        <div>
          <div class="sec-head" style="margin-top:0;">
            <h2>희망도서 신청</h2>
            <div class="rule" />
            <button type="button" class="btn sm" @click="requestFormOpen = !requestFormOpen">
              {{ requestFormOpen ? '닫기' : '+ 직접 신청' }}
            </button>
          </div>
          <div class="panel" style="padding: 6px 20px;">
            <div v-if="requestFormOpen" class="request-form">
              <input v-model="requestTitle" type="text" class="input" placeholder="책 제목 (필수)" @keyup.enter="submitPurchaseRequest" />
              <input v-model="requestAuthor" type="text" class="input" placeholder="저자 (선택)" @keyup.enter="submitPurchaseRequest" />
              <button
                type="button"
                class="btn primary sm"
                :disabled="requestBusy || !requestTitle.trim()"
                @click="submitPurchaseRequest"
              >{{ requestBusy ? '신청 중...' : '신청하기' }}</button>
            </div>
            <div v-if="!purchaseRequests?.length && !requestFormOpen" class="hint">신청한 희망도서가 없어요.</div>
            <div v-for="req in purchaseRequests" :key="req.id" class="mini-row">
              <div style="flex:1;">
                <b style="font-size:14px;">{{ req.title }}</b>
                <div style="font-size:12.5px; color:var(--sub);">{{ requestMeta(req) }}</div>
              </div>
              <span class="badge" :class="STATUS_BADGE[req.status].cls">{{ STATUS_BADGE[req.status].label }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="sec-head" id="calendar">
        <h2>도서 달력</h2>
        <div class="rule" />
        <span class="cal-count">{{ calYear }}년 {{ calMonth }}월 완독 <b>{{ monthDoneCount }}권</b></span>
      </div>
      <div class="panel cal-panel">
        <div class="cal-head">
          <h3>{{ calYear }}년 {{ calMonth }}월</h3>
          <div class="cal-nav">
            <button type="button" aria-label="이전 달" @click="prevMonth">&#8249;</button>
            <button type="button" aria-label="다음 달" @click="nextMonth">&#8250;</button>
          </div>
          <button type="button" class="chip" :class="{ on: isCurrentMonth }" :disabled="isCurrentMonth" @click="goThisMonth">이달</button>
        </div>
        <ReadingCalendar :year="calYear" :month="calMonth" :loans="doneLoans ?? []" />
      </div>

      <div class="sec-head">
        <h2>내가 남긴 리뷰</h2>
        <div class="rule" />
      </div>
      <div class="panel" style="padding: 6px 20px;">
        <div v-if="!myReviews?.length" class="hint">아직 남긴 리뷰가 없어요.</div>
        <div v-for="review in myReviews" :key="review.id" class="my-review">
          <BookCoverImage :src="review.bookCoverUrl" :alt="review.bookTitle" />
          <div class="rv-body">
            <NuxtLink :to="`/books/${review.bookId}`" class="rv-title">{{ review.bookTitle }}</NuxtLink>
            <div class="rv-meta">
              <span class="rv-stars">★ {{ review.rating.toFixed(1) }}</span>
              <span>{{ reviewDate(review.createdAt) }}</span>
            </div>
            <div class="rv-text">{{ review.content }}</div>
          </div>
          <NuxtLink :to="`/books/${review.bookId}`" class="btn sm">책 보기</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile { display: flex; align-items: center; gap: 18px; }
.profile .info b { font-family: var(--font-display); font-size: 22px; display: block; margin-bottom: 3px; }
.profile .info span { font-size: 13.5px; color: var(--sub); }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

/* 도서 달력 섹션(QA #72) */
.cal-count { font-size: 13px; color: var(--sub); white-space: nowrap; }
.cal-count b { color: var(--ink); }
.cal-panel { padding: 20px 22px; }
.cal-head { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.cal-head h3 { font-family: var(--font-display); font-size: 19px; font-weight: 700; margin: 0; }
.cal-nav { display: flex; gap: 6px; }
.cal-nav button { font: inherit; width: 30px; height: 30px; border-radius: 3px; border: 1px solid var(--line-strong); background: transparent; cursor: pointer; color: var(--sub); font-size: 14px; }
.cal-nav button:hover { background: #F4F0E8; }
.cal-head .chip { margin-left: auto; }
.cal-head .chip:disabled { cursor: default; }

.reading-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line); }
.reading-row:last-child { border-bottom: 0; }
.reading-row :deep(.cv) { width: 46px; height: 66px; }
.reading-row .t { font-weight: 700; font-size: 14.5px; margin-bottom: 2px; }
.reading-row .a { font-size: 12.5px; color: var(--sub); }
.due { font-size: 12.5px; color: var(--sub); white-space: nowrap; margin-left: auto; }
.due.over { color: var(--warn); font-weight: 700; }

.mini-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.mini-row:last-child { border-bottom: 0; }
.mini-row :deep(.cv) { width: 34px; height: 48px; }
.cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }

.fav-cats { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.fav-label { font-size: 11.5px; font-weight: 700; color: var(--sub); margin-right: 2px; }

.request-form { display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.request-form .input { flex: 1; min-width: 0; }

.my-review { display: flex; align-items: flex-start; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.my-review:last-child { border-bottom: 0; }
.my-review :deep(.cv) { width: 38px; height: 54px; flex-shrink: 0; }
.my-review .rv-body { flex: 1; min-width: 0; }
.my-review .rv-title { font-size: 14px; font-weight: 700; color: var(--ink); text-decoration: none; }
.my-review .rv-title:hover { color: var(--red); }
.my-review .rv-meta { display: flex; gap: 10px; font-size: 12px; color: var(--sub); margin: 2px 0 4px; }
.my-review .rv-stars { color: #C9A227; font-weight: 700; }
.my-review .rv-text { font-size: 13.5px; line-height: 1.6; color: #3E382D; }
.my-review .btn { align-self: center; flex-shrink: 0; }

@media (max-width: 900px) {
  .cols2 { grid-template-columns: 1fr; }
  /* 640~900px에서 프로필 텍스트와 책쌓기 위젯이 한 줄에 눌려 낱말이 세로로 쪼개지던 문제 —
     위젯을 아래 줄로 내리고 뱃지·숫자는 줄바꿈 금지 */
  .profile { flex-wrap: wrap; }
  .profile .info { flex: 1; min-width: 0; }
  .fav-cats { flex-wrap: wrap; }
  .fav-cats .badge, .fav-label { white-space: nowrap; }
}
@media (max-width: 640px) {
  .profile { gap: 14px; }
  .profile .info b { font-size: 19px; }
  .reading-row { flex-wrap: wrap; gap: 12px; }
  .reading-row > div:nth-child(2) { flex: 1 1 200px; min-width: 0; }
  .reading-row .due { flex: 1 1 calc(100% - 140px); margin-left: 58px; white-space: normal; }
  .request-form { flex-direction: column; }
  .my-review { flex-wrap: wrap; }
  /* 인라인 flex:1 이 클래스 규칙을 이기던 문제 — 클래스로 옮긴 뒤 기준 폭을 줘서 버튼을 아래 줄로 */
  .my-review .rv-body { flex: 1 1 200px; }
  .my-review .btn { margin-left: 52px; }
}
</style>
