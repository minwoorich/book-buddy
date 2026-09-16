<script setup lang="ts">
import type { ReviewCard, ReviewFeed, ReviewOrg } from '#shared/types'

type Sort = 'popular' | 'latest' | 'rating'

const api = useApi()
const { user } = useCurrentUser()

const sort = ref<Sort>('popular')
/** 소속 필터 — `all` 또는 `계열사|부서|팀` 중 채워진 만큼만 이은 키. */
const orgKey = ref('all')
/** 이달의 다독왕(랭킹 개인·이달 TOP 3)이 남긴 리뷰만 보기. */
const topReaderOnly = ref(false)

const SORTS: { key: Sort; label: string }[] = [
  { key: 'popular', label: '추천순' },
  { key: 'latest', label: '최신순' },
  { key: 'rating', label: '별점순' },
]

/** 소속 키 인코딩 — 상위 소속까지 함께 담아야 "바텍/연구소"와 "레이언스/연구소"가 구분된다. */
function orgKeyOf(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join('|')
}

/** `바텍|연구소|플랫폼팀` → `바텍 · 연구소 · 플랫폼팀` */
function orgLabel(key: string): string {
  return key.split('|').join(' · ')
}

/** 내 소속 기준 빠른 칩. 부서·팀은 가입 시 선택 입력이라 비어 있으면 칩도 뺀다. */
const myChips = computed<{ key: string; label: string }[]>(() => {
  const me = user.value
  if (!me) return []
  const chips: { key: string; label: string }[] = []
  if (me.team) chips.push({ key: orgKeyOf([me.company, me.department, me.team]), label: '우리 팀' })
  if (me.department) chips.push({ key: orgKeyOf([me.company, me.department]), label: '우리 부서' })
  chips.push({ key: orgKeyOf([me.company]), label: '우리 계열사' })
  return chips
})

const EMPTY_FEED: ReviewFeed = { stats: { count: 0, avg: null }, reviews: [], orgs: [] }

const orgQuery = computed<{ company?: string; department?: string; team?: string }>(() => {
  if (orgKey.value === 'all') return {}
  const [company, department, team] = orgKey.value.split('|')
  return { company, department, team }
})

const { data, refresh } = await useAsyncData<ReviewFeed>(
  'all-reviews',
  () =>
    user.value
      ? api<ReviewFeed>('/api/reviews', {
          query: {
            scope: 'all',
            sort: sort.value,
            ...orgQuery.value,
            ...(topReaderOnly.value ? { topReader: '1' } : {}),
          },
        })
      : Promise.resolve(EMPTY_FEED),
  { watch: [sort, orgKey, topReaderOnly], default: () => EMPTY_FEED }
)

const reviews = computed(() => data.value.reviews)
const orgs = computed<ReviewOrg[]>(() => data.value.orgs)

/** 드롭다운 선택지 — 계열사/부서/팀 세 그룹. 리뷰가 있는 조합만 서버가 내려준다. */
function uniqueKeys(keys: string[]): string[] {
  return [...new Set(keys)]
}
const companyOptions = computed(() => uniqueKeys(orgs.value.map((o) => orgKeyOf([o.company]))))
const departmentOptions = computed(() =>
  uniqueKeys(orgs.value.filter((o) => o.department).map((o) => orgKeyOf([o.company, o.department])))
)
const teamOptions = computed(() =>
  uniqueKeys(orgs.value.filter((o) => o.team).map((o) => orgKeyOf([o.company, o.department, o.team])))
)

const filtered = computed(() => orgKey.value !== 'all' || topReaderOnly.value)

function resetFilters() {
  orgKey.value = 'all'
  topReaderOnly.value = false
}

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
        <!-- 성격이 다른 두 줄: 위는 "누구의 리뷰를 볼지"(소속·다독왕), 아래는 "어떤 순서로"(정렬). -->
        <div class="filters">
          <div class="chips">
            <span class="chip" :class="{ on: orgKey === 'all' }" @click="orgKey = 'all'">전체</span>
            <span
              v-for="c in myChips"
              :key="c.key"
              class="chip"
              :class="{ on: orgKey === c.key }"
              @click="orgKey = c.key"
            >{{ c.label }}</span>
            <span
              class="chip trophy"
              :class="{ on: topReaderOnly }"
              @click="topReaderOnly = !topReaderOnly"
            >🏆 다독왕 리뷰</span>
          </div>

          <select v-model="orgKey" class="org-select" aria-label="조직 선택">
            <option value="all">다른 조직 보기</option>
            <optgroup label="계열사">
              <option v-for="key in companyOptions" :key="key" :value="key">{{ orgLabel(key) }}</option>
            </optgroup>
            <optgroup v-if="departmentOptions.length" label="부서">
              <option v-for="key in departmentOptions" :key="key" :value="key">{{ orgLabel(key) }}</option>
            </optgroup>
            <optgroup v-if="teamOptions.length" label="팀">
              <option v-for="key in teamOptions" :key="key" :value="key">{{ orgLabel(key) }}</option>
            </optgroup>
          </select>
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

        <p v-if="!reviews.length && filtered" class="hint">
          이 조건에 맞는 리뷰가 없어요.
          <button type="button" class="link-btn" @click="resetFilters">필터 해제</button>
        </p>
        <p v-else-if="!reviews.length" class="hint">아직 리뷰가 없어요. 첫 리뷰의 주인공이 되어보세요.</p>
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
                <span v-if="review.topReaderRank" class="badge gold">🏆 다독왕 {{ review.topReaderRank }}위</span>
                <span class="dept">{{ review.department }}</span>
                <span class="when">{{ whenLabel(review.createdAt) }}</span>
              </div>

              <div class="stars" :aria-label="`별점 ${review.rating}점`">
                <svg
                  v-for="(filled, i) in starFills(review.rating)"
                  :key="i"
                  width="14" height="14" viewBox="0 0 24 24"
                  :style="{ fill: filled ? 'var(--star)' : 'none', stroke: filled ? 'var(--star)' : 'var(--line-hover)' }"
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
/* 별점 토큰에는 배경용 옅은 색이 없어 여기서만 파생시킨다(--star의 12% 틴트). */
.feed-shell, .filters { --star-tint: color-mix(in srgb, var(--star) 14%, transparent); }
/* 제목과 목록 사이를 넉넉히 띄우고(QA #63·#67), 평균 별점 요약은 뺐다(QA #63·#67). */
.head-row { display: flex; align-items: flex-end; gap: 20px; margin-bottom: 36px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }

/* 왓챠피디아 코멘트 피드처럼 카드 그리드 대신 가운데 정렬된 단일 목록으로 쌓는다 —
   격자에서 카드 높이가 제각각이라 줄이 삐뚤빼뚤해지는 문제를 원천적으로 없앤다. */
.feed-shell { max-width: 760px; margin: 0 auto; }

/* 소속·다독왕 칩(왼쪽) + 조직 드롭다운(오른쪽) 한 줄. */
.filters { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
/* 다독왕은 금색 계열 — 별점 토큰을 그대로 써서 다크·색각 모드에서도 대비가 유지된다. */
.chip.trophy.on { border-color: var(--star); color: var(--star-text); background: var(--star-tint); font-weight: 600; }

.org-select {
  margin-left: auto; flex-shrink: 0;
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--sub);
  background: transparent; border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 6px 10px; cursor: pointer; max-width: 210px;
}
.org-select:hover { background: var(--hover); }

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

/* 다독왕 뱃지는 금색 — VATECH 레드는 "나" 뱃지 같은 포인트 자리에만 남긴다. */
.badge.gold { color: var(--star-text); background: var(--star-tint); }

.stars { display: flex; align-items: center; gap: 2px; margin-bottom: 9px; }
.stars-num { margin-left: 4px; font-size: 12.5px; font-weight: 700; color: var(--star-text); }

.content { margin: 0 0 12px; font-size: 15px; line-height: 1.7; color: var(--text-2); }

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
.vote:hover { background: var(--hover); }
.vote.on { border-color: var(--red); color: var(--red); background: var(--red-tint); }
.vote:disabled { opacity: .6; cursor: default; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; text-align: center; }
.link-btn {
  font: inherit; font-size: 14px; font-weight: 700; color: var(--red);
  background: none; border: 0; padding: 0 0 0 4px; cursor: pointer; text-decoration: underline;
}

@media (max-width: 700px) {
  .head-row { flex-direction: column; align-items: flex-start; margin-bottom: 26px; padding-bottom: 14px; }
  .filters { flex-direction: column; align-items: stretch; }
  .org-select { margin-left: 0; max-width: none; }
  .sorts { justify-content: flex-start; }
  .row-top .when { margin-left: 0; width: 100%; order: 1; }
}
</style>
