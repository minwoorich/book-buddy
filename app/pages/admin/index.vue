<script setup lang="ts">
import type { Book, Loan, PurchaseRequest, Report, User } from '#shared/types'

type LoanWithBook = Loan & { book: Book }
type ReportWithMeta = Report & { reporterName: string; targetLabel: string }

const api = useApi()
const { user } = useCurrentUser()

const isAdmin = computed(() => user.value?.role === 'admin')

const bookRegisterRef = ref<{ prefillAndSearch: (title: string) => Promise<void> } | null>(null)

// 전체 장서 수 — 공개 엔드포인트라 비로그인 SSR에서도 채워진다(뼈대 유지).
const { data: totalBooks, refresh: refreshTotalBooks } = await useAsyncData<Book[]>(
  'admin-total-books',
  () => api<Book[]>('/api/books'),
  { default: () => [] }
)

const { data: activeLoans, refresh: refreshActiveLoans } = await useAsyncData<LoanWithBook[]>(
  'admin-active-loans',
  () =>
    isAdmin.value ? api<LoanWithBook[]>('/api/loans', { query: { active: true, scope: 'all' } }) : Promise.resolve([]),
  { default: () => [] }
)

const { data: recentLoans, refresh: refreshRecentLoans } = await useAsyncData<LoanWithBook[]>(
  'admin-recent-loans',
  () =>
    isAdmin.value ? api<LoanWithBook[]>('/api/loans', { query: { recent: 8, scope: 'all' } }) : Promise.resolve([]),
  { default: () => [] }
)

const { data: requests, refresh: refreshRequests } = await useAsyncData<PurchaseRequest[]>(
  'admin-requests',
  () =>
    isAdmin.value
      ? api<PurchaseRequest[]>('/api/purchase-requests', { query: { status: 'requested', scope: 'all' } })
      : Promise.resolve([]),
  { default: () => [] }
)

const { data: reports, refresh: refreshReports } = await useAsyncData<ReportWithMeta[]>(
  'admin-reports',
  () =>
    isAdmin.value ? api<ReportWithMeta[]>('/api/reports', { query: { status: 'pending' } }) : Promise.resolve([]),
  { default: () => [] }
)

const { data: users } = await useAsyncData<User[]>('admin-users', () => api<User[]>('/api/users'), {
  default: () => [],
})

const userMap = computed(() => new Map((users.value ?? []).map((u) => [u.id, u])))

// ── 날짜 계산 ────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
const today = startOfDay(new Date())

function overdueDays(dueAt: string): number {
  const due = startOfDay(parseDbDate(dueAt))
  return Math.round((today.getTime() - due.getTime()) / 86_400_000)
}

function formatMD(dateStr: string): string {
  const d = parseDbDate(dateStr)
  return `${d.getMonth() + 1}. ${d.getDate()}.`
}

// ── 통계 타일 ────────────────────────────────────────────────────────
const overdueLoans = computed(() => (activeLoans.value ?? []).filter((l) => overdueDays(l.dueAt) > 0))
const maxOverdueDays = computed(() =>
  overdueLoans.value.length ? Math.max(...overdueLoans.value.map((l) => overdueDays(l.dueAt))) : 0
)

// ── 최근 대출 · 반납 ─────────────────────────────────────────────────
type LoanRow = {
  loan: LoanWithBook
  borrowerName: string
  borrowerTeam: string
  loanedLabel: string
  badge: { cls: string; label: string }
}

function toLoanRow(loan: LoanWithBook): LoanRow {
  const u = userMap.value.get(loan.userId)
  const badge = loan.returnedAt
    ? { cls: 'ok', label: `${formatMD(loan.returnedAt)} 반납` }
    : overdueDays(loan.dueAt) > 0
      ? { cls: 'warn', label: `연체 ${overdueDays(loan.dueAt)}일` }
      : { cls: 'no', label: '대출중' }
  return {
    loan,
    borrowerName: u?.name ?? '알 수 없음',
    borrowerTeam: u?.team ?? '',
    loanedLabel: formatMD(loan.loanedAt),
    badge,
  }
}

const recentLoanRows = computed(() => (recentLoans.value ?? []).map(toLoanRow))

const returnBusyId = ref<number | null>(null)
async function returnLoan(loanId: number) {
  if (returnBusyId.value !== null) return
  returnBusyId.value = loanId
  try {
    await api(`/api/loans/${loanId}`, { method: 'PATCH', body: { returned: true } })
    await Promise.all([refreshActiveLoans(), refreshRecentLoans()])
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    returnBusyId.value = null
  }
}

// ── 희망도서 신청 ─────────────────────────────────────────────────────
function requestMeta(r: PurchaseRequest): string {
  const u = userMap.value.get(r.userId)
  const parts = [u?.name ?? '알 수 없음', formatMD(r.createdAt)]
  if (r.reason) parts.push(`"${r.reason}"`)
  return parts.join(' · ')
}

const requestBusyId = ref<number | null>(null)
async function decideRequest(req: PurchaseRequest, status: 'approved' | 'rejected') {
  if (requestBusyId.value !== null) return
  requestBusyId.value = req.id
  try {
    await api(`/api/purchase-requests/${req.id}`, { method: 'PATCH', body: { status } })
    await refreshRequests()
    if (status === 'approved' && confirm('승인했어요. 이어서 책을 등록할까요?')) {
      await bookRegisterRef.value?.prefillAndSearch(req.title)
    }
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    requestBusyId.value = null
  }
}

// ── 신고 ────────────────────────────────────────────────────────────
const TARGET_TYPE_LABEL: Record<Report['targetType'], string> = {
  book: '도서',
  post: '게시물',
  review: '리뷰',
}

function reportMeta(r: ReportWithMeta): string {
  return `${r.reporterName} · ${formatMD(r.createdAt)} · "${r.reason}"`
}

const reportBusyId = ref<number | null>(null)
async function resolveReport(id: number) {
  if (reportBusyId.value !== null) return
  reportBusyId.value = id
  try {
    await api(`/api/reports/${id}`, { method: 'PATCH', body: { status: 'resolved' } })
    await refreshReports()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    reportBusyId.value = null
  }
}

// ── 책 등록 ─────────────────────────────────────────────────────────
function onBookRegistered() {
  refreshTotalBooks()
}
</script>

<template>
  <div>
    <AdminHeader active="dashboard" />
    <div class="wrap">
      <div class="page-head">
        <span class="eyebrow">LIBRARY ADMIN</span>
        <h1>관리자 대시보드</h1>
      </div>

      <div class="stat-tiles">
        <div class="tile">
          <div class="lbl">대출 중</div>
          <b>{{ activeLoans?.length ?? 0 }}</b><span style="font-size:14px; color:var(--sub);"> 권</span>
          <div class="sub">전체 장서 {{ totalBooks?.length ?? 0 }}권</div>
        </div>
        <div class="tile" :class="{ alert: overdueLoans.length > 0 }">
          <div class="lbl">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="stroke: var(--warn)" stroke-width="2" stroke-linejoin="round"><path d="M12 3L2 21h20L12 3z"></path><line x1="12" y1="10" x2="12" y2="15"></line><circle cx="12" cy="18" r="0.5"></circle></svg>
            연체
          </div>
          <b>{{ overdueLoans.length }}</b><span style="font-size:14px; color:var(--sub);"> 건</span>
          <div class="sub">최장 연체 {{ maxOverdueDays }}일</div>
        </div>
        <div class="tile">
          <div class="lbl">희망도서 신청 대기</div>
          <b>{{ requests?.length ?? 0 }}</b><span style="font-size:14px; color:var(--sub);"> 건</span>
        </div>
        <div class="tile">
          <div class="lbl">신고 대기</div>
          <b>{{ reports?.length ?? 0 }}</b><span style="font-size:14px; color:var(--sub);"> 건</span>
        </div>
      </div>

      <div class="cols">
        <div>
          <div class="sec-head" style="margin-top:0;">
            <h2>최근 대출 · 반납</h2>
            <div class="rule" />
          </div>
          <div class="panel" style="padding: 8px 14px;">
            <p v-if="!recentLoanRows.length" class="hint">최근 대출 기록이 없어요.</p>
            <table v-else class="table stack-sm">
              <tr><th>도서</th><th>대출자</th><th>대출일</th><th>상태</th><th /></tr>
              <tr v-for="row in recentLoanRows" :key="row.loan.id">
                <td class="full"><b>{{ row.loan.book.title }}</b></td>
                <td>{{ row.borrowerName }} <span style="color:var(--sub); font-size:12px;">{{ row.borrowerTeam }}</span></td>
                <td>{{ row.loanedLabel }}</td>
                <td><span class="badge" :class="row.badge.cls">{{ row.badge.label }}</span></td>
                <td class="row-actions end">
                  <button
                    v-if="!row.loan.returnedAt"
                    type="button"
                    class="btn sm"
                    :disabled="returnBusyId === row.loan.id"
                    @click="returnLoan(row.loan.id)"
                  >반납 처리</button>
                </td>
              </tr>
            </table>
          </div>

          <div class="sec-head">
            <h2>책 등록</h2>
            <div class="rule" />
          </div>
          <div class="panel">
            <AdminBookRegister ref="bookRegisterRef" @registered="onBookRegistered" />
          </div>

          <div class="sec-head">
            <h2>메인 화면 구성</h2>
            <div class="rule" />
          </div>
          <div class="panel" style="padding: 8px 14px;">
            <AdminHomeSectionEditor />
          </div>
        </div>

        <div>
          <div class="sec-head" style="margin-top:0;">
            <h2>희망도서 신청</h2>
            <div class="rule" />
          </div>
          <div class="panel" style="padding: 8px 14px; margin-bottom: 26px;">
            <p v-if="!requests?.length" class="hint">대기 중인 신청이 없어요.</p>
            <table v-else class="table">
              <tr v-for="req in requests" :key="req.id">
                <td>
                  <b>{{ req.title }}</b>
                  <div style="font-size:12px; color:var(--sub);">{{ requestMeta(req) }}</div>
                </td>
                <td class="row-actions" style="text-align:right;">
                  <button
                    type="button"
                    class="btn primary sm"
                    :disabled="requestBusyId === req.id"
                    @click="decideRequest(req, 'approved')"
                  >승인</button>
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="requestBusyId === req.id"
                    @click="decideRequest(req, 'rejected')"
                  >거절</button>
                </td>
              </tr>
            </table>
          </div>

          <div class="sec-head">
            <h2>신고</h2>
            <div class="rule" />
          </div>
          <div class="panel" style="padding: 8px 14px;">
            <p v-if="!reports?.length" class="hint">대기 중인 신고가 없어요.</p>
            <table v-else class="table">
              <tr v-for="rpt in reports" :key="rpt.id">
                <td>
                  <span class="badge warn">{{ TARGET_TYPE_LABEL[rpt.targetType] }}</span>
                  <b style="margin-left:6px;">{{ rpt.targetLabel }}</b>
                  <div style="font-size:12px; color:var(--sub); margin-top:3px;">{{ reportMeta(rpt) }}</div>
                </td>
                <td style="text-align:right;">
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="reportBusyId === rpt.id"
                    @click="resolveReport(rpt.id)"
                  >처리</button>
                </td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 34px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 18px 20px; box-shadow: 0 2px 10px var(--shadow); }
.tile .lbl { font-size: 12.5px; color: var(--sub); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.tile b { font-family: var(--font-display); font-size: 30px; font-weight: 600; }
.tile .sub { font-size: 12px; color: var(--sub); margin-top: 4px; }
.tile.alert { border-top: 2px solid var(--warn); }
.tile.alert b { color: var(--warn); }

.cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; align-items: start; }
.row-actions { display: flex; gap: 6px; }
.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 900px) {
  .stat-tiles { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .cols { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .tile { padding: 14px 16px; }
  .tile b { font-size: 26px; }
  .row-actions { flex-wrap: wrap; }
}
</style>
