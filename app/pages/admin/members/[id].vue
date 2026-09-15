<script setup lang="ts">
import type { Book, Loan, Review, User } from '#shared/types'

type LoanWithBook = Loan & { book: Book }
type MemberReview = Review & { bookTitle: string; bookCoverUrl: string | null }
type Detail = { user: User; loans: LoanWithBook[]; reviews: MemberReview[] }
type LoanFilter = 'all' | 'active' | 'returned'

const route = useRoute()
const api = useApi()
const { user } = useCurrentUser()
const memberId = computed(() => Number(route.params.id))

const { data: detail, error } = await useAsyncData<Detail | null>(
  () => `admin-member-${memberId.value}`,
  () =>
    user.value?.role === 'admin' ? api<Detail>(`/api/admin/members/${memberId.value}`) : Promise.resolve(null),
  { default: () => null, watch: [memberId] }
)

// ── 대출 상태: 대출중 / 연체 N일 / 반납(제때) / 연체 반납 ─────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
const today = startOfDay(new Date())

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
}

type LoanStatus = { label: string; cls: 'ok' | 'warn' | 'no' | 'red' }

function loanStatus(l: LoanWithBook): LoanStatus {
  const due = parseDbDate(l.dueAt)
  if (!l.returnedAt) {
    const over = daysBetween(today, due)
    return over > 0 ? { label: `연체 ${over}일`, cls: 'red' } : { label: `대출중 (D-${-over})`, cls: 'warn' }
  }
  const late = daysBetween(parseDbDate(l.returnedAt), due)
  return late > 0 ? { label: `반납 (${late}일 늦게)`, cls: 'no' } : { label: '반납', cls: 'ok' }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = parseDbDate(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

const loanFilter = ref<LoanFilter>('all')
const LOAN_FILTERS: { key: LoanFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '대출중' },
  { key: 'returned', label: '반납' },
]

const loans = computed(() => detail.value?.loans ?? [])
const filteredLoans = computed(() =>
  loans.value.filter((l) => {
    if (loanFilter.value === 'active') return !l.returnedAt
    if (loanFilter.value === 'returned') return !!l.returnedAt
    return true
  })
)

const stats = computed(() => {
  const list = loans.value
  const active = list.filter((l) => !l.returnedAt)
  return {
    total: list.length,
    active: active.length,
    overdue: active.filter((l) => daysBetween(today, parseDbDate(l.dueAt)) > 0).length,
    completed: list.filter((l) => !!l.returnedAt).length,
    lateReturns: list.filter((l) => l.returnedAt && daysBetween(parseDbDate(l.returnedAt), parseDbDate(l.dueAt)) > 0).length,
    reviews: detail.value?.reviews.length ?? 0,
  }
})

const firstLoanAt = computed(() => {
  const list = loans.value
  if (!list.length) return null
  return list.reduce((min, l) => (l.loanedAt < min ? l.loanedAt : min), list[0].loanedAt)
})
</script>

<template>
  <div>
    <AdminHeader active="members" />
    <div class="wrap">
      <NuxtLink to="/admin/members" class="back">← 회원 목록</NuxtLink>

      <div v-if="error" class="hint">{{ apiErrorMessage(error) }}</div>
      <template v-else-if="detail">
        <div class="panel profile">
          <span class="avatar lg">{{ detail.user.name.charAt(0) }}</span>
          <div class="info">
            <b>{{ detail.user.name }} <span v-if="detail.user.role === 'admin'" class="badge red">관리자</span></b>
            <span>{{ detail.user.company }} · {{ detail.user.department }} · {{ detail.user.team }} · {{ detail.user.position }}</span>
            <span v-if="firstLoanAt" class="since">첫 대출 {{ formatDate(firstLoanAt) }}</span>
          </div>
          <div class="tiles">
            <div class="tile"><b>{{ stats.active }}</b><span>대출중</span></div>
            <div class="tile" :class="{ hot: stats.overdue }"><b>{{ stats.overdue }}</b><span>연체</span></div>
            <div class="tile"><b>{{ stats.completed }}</b><span>완독(반납)</span></div>
            <div class="tile"><b>{{ stats.lateReturns }}</b><span>늦은 반납</span></div>
            <div class="tile"><b>{{ stats.reviews }}</b><span>리뷰</span></div>
          </div>
        </div>

        <div class="sec-head">
          <h2>대출·반납 이력</h2>
          <div class="rule" />
          <div class="filters">
            <span v-for="f in LOAN_FILTERS" :key="f.key" class="chip" :class="{ on: loanFilter === f.key }" @click="loanFilter = f.key">{{ f.label }}</span>
          </div>
          <span class="count">{{ filteredLoans.length }}건</span>
        </div>
        <div class="panel" style="padding: 8px 14px;">
          <table v-if="filteredLoans.length" class="table stack-sm loans-table">
            <tbody>
              <tr>
                <th>책</th>
                <th style="width: 110px;">대출일</th>
                <th style="width: 110px;">반납 예정</th>
                <th style="width: 110px;">반납일</th>
                <th style="width: 130px;">상태</th>
              </tr>
              <tr v-for="l in filteredLoans" :key="l.id">
                <td class="full book-cell">
                  <NuxtLink :to="`/books/${l.book.id}`" class="book-link">
                    <BookCoverImage :src="l.book.coverUrl" :alt="l.book.title" />
                    <span>
                      <b>{{ l.book.title }}</b>
                      <i>{{ l.book.author }}</i>
                    </span>
                  </NuxtLink>
                </td>
                <td class="when">{{ formatDate(l.loanedAt) }}</td>
                <td class="when">{{ formatDate(l.dueAt) }}</td>
                <td class="when">{{ formatDate(l.returnedAt) }}</td>
                <td><span class="badge" :class="loanStatus(l).cls">{{ loanStatus(l).label }}</span></td>
              </tr>
            </tbody>
          </table>
          <div v-else class="hint">대출 이력이 없어요</div>
        </div>

        <div class="sec-head">
          <h2>남긴 리뷰</h2>
          <div class="rule" />
          <span class="count">{{ detail.reviews.length }}건</span>
        </div>
        <div class="panel" style="padding: 6px 18px;">
          <div v-if="!detail.reviews.length" class="hint">남긴 리뷰가 없어요</div>
          <div v-for="r in detail.reviews" :key="r.id" class="review-row">
            <BookCoverImage :src="r.bookCoverUrl" :alt="r.bookTitle" />
            <div class="rv-body">
              <NuxtLink :to="`/books/${r.bookId}`" class="rv-title">{{ r.bookTitle }}</NuxtLink>
              <div class="rv-meta"><span class="rv-stars">★ {{ r.rating.toFixed(1) }}</span><span>{{ formatDate(r.createdAt) }}</span></div>
              <div class="rv-text">{{ r.content }}</div>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="hint">불러오는 중…</div>
    </div>
  </div>
</template>

<style scoped>
.back { display: inline-block; font-size: 13px; color: var(--sub); margin-bottom: 16px; }
.back:hover { color: var(--red); }
.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

.profile { display: flex; align-items: center; gap: 18px; margin-bottom: 8px; }
.profile .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.profile .info b { font-family: var(--font-display); font-size: 21px; }
.profile .info span { font-size: 13.5px; color: var(--sub); }
.profile .since { font-size: 12px; }
.tiles { margin-left: auto; display: flex; gap: 8px; }
.tile { min-width: 74px; text-align: center; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--card-2); }
.tile b { display: block; font-family: var(--font-display); font-size: 22px; font-weight: 700; line-height: 1.1; }
.tile span { font-size: 11.5px; color: var(--sub); }
.tile.hot { border-color: var(--red); }
.tile.hot b { color: var(--red); }

.sec-head .filters { display: flex; gap: 6px; }
.sec-head .count { font-size: 13px; color: var(--sub); white-space: nowrap; }

.book-link { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; }
.book-link :deep(.cv) { width: 34px; height: 48px; flex-shrink: 0; }
.book-link b { display: block; font-size: 14px; }
.book-link i { display: block; font-style: normal; font-size: 12px; color: var(--sub); }
.book-link:hover b { color: var(--red); }
.when { font-size: 13px; color: var(--sub); white-space: nowrap; font-variant-numeric: tabular-nums; }

.review-row { display: flex; align-items: flex-start; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.review-row:last-child { border-bottom: 0; }
.review-row :deep(.cv) { width: 38px; height: 54px; flex-shrink: 0; }
.rv-body { flex: 1; min-width: 0; }
.rv-title { font-size: 14px; font-weight: 700; color: var(--ink); text-decoration: none; }
.rv-title:hover { color: var(--red); }
.rv-meta { display: flex; gap: 10px; font-size: 12px; color: var(--sub); margin: 2px 0 4px; }
.rv-stars { color: #A8841C; font-weight: 700; }
.rv-text { font-size: 13.5px; line-height: 1.6; }

@media (max-width: 900px) {
  .profile { flex-wrap: wrap; }
  .tiles { margin-left: 0; flex-basis: 100%; flex-wrap: wrap; }
  .tile { flex: 1 1 calc(33% - 8px); }
}
@media (max-width: 640px) {
  .sec-head { flex-wrap: wrap; }
  .loans-table th { width: auto !important; }
}
</style>
