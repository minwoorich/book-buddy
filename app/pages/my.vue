<script setup lang="ts">
import type { Book, Loan, PurchaseRequest, RankRow, Reservation, Wishlist } from '#shared/types'

type LoanWithBook = Loan & { book: Book }
type WishlistWithBook = Wishlist & { book: Book }
type ReservationWithBook = Reservation & { book: Book }

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
  () => (user.value ? api<RankRow[]>('/api/rankings', { query: { by: 'user' } }) : Promise.resolve([])),
  { default: () => [] }
)

const myRank = computed(() => {
  if (!user.value) return null
  const idx = (userRankings.value ?? []).findIndex((r) => r.userId === user.value!.id)
  return idx === -1 ? null : idx + 1
})

async function refreshAll() {
  await Promise.all([
    refreshActive(),
    refreshDone(),
    refreshWishlists(),
    refreshReservations(),
    refreshPurchaseRequests(),
  ])
}

// ── 읽고 있는 책: 대출일·반납일·D-day ─────────────────────────────
function formatMD(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}. ${d.getDate()}.`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const readingRows = computed(() => {
  const today = startOfDay(new Date())
  return (activeLoans.value ?? []).map((loan) => {
    const due = startOfDay(new Date(loan.dueAt))
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
  returnBusyId.value = loanId
  try {
    await api(`/api/loans/${loanId}`, { method: 'PATCH', body: { returned: true } })
    await refreshAll()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    returnBusyId.value = null
  }
}

// ── 읽은 책 선반 ───────────────────────────────────────────────────
const doneSorted = computed(() =>
  [...(doneLoans.value ?? [])].sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''))
)
const readBooks = computed(() => doneSorted.value.map((l) => l.book))
const readMetaTexts = computed(() =>
  doneSorted.value.map((l) => {
    if (!l.returnedAt) return ''
    const d = new Date(l.returnedAt)
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

function requestMeta(r: PurchaseRequest): string {
  const d = new Date(r.createdAt)
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
            <div v-for="(r, i) in reservations" :key="r.id" class="mini-row">
              <BookCoverImage :src="r.book.coverUrl" :alt="r.book.title" />
              <div style="flex:1;">
                <b style="font-size:14px;">{{ r.book.title }}</b>
                <div style="font-size:12.5px; color:var(--sub);">예약 {{ i + 1 }}순위 · 반납되면 알려드려요</div>
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
          </div>
          <div class="panel" style="padding: 6px 20px;">
            <div v-if="!purchaseRequests?.length" class="hint">신청한 희망도서가 없어요.</div>
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
    </div>
  </div>
</template>

<style scoped>
.profile { display: flex; align-items: center; gap: 18px; }
.profile .info b { font-family: "Noto Serif KR", serif; font-size: 22px; display: block; margin-bottom: 3px; }
.profile .info span { font-size: 13.5px; color: var(--sub); }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

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
</style>
