<script setup lang="ts">
import type { Book, ExternalBookSearchItem } from '#shared/types'

type BookWithMeta = Book & {
  status: 'available' | 'loaned'
  waitingCount: number
  avgRating: number | null
  reviewCount: number
}

type HomeSectionData = { key: string; title: string; books: BookWithMeta[] }

const route = useRoute()
const router = useRouter()
const api = useApi()

function queryParam(): string {
  const q = route.query.q
  return typeof q === 'string' ? q : ''
}

const searchInput = ref(queryParam())
const selectedCategory = ref('전체')
const activeQuery = computed(() => queryParam())

watch(activeQuery, (q) => {
  searchInput.value = q
})

function submitSearch() {
  const q = searchInput.value.trim()
  router.push({ query: q ? { q } : {} })
}

// ── 히어로 타이틀 문구 로테이션(QA #52, 전호연): 기본 인사 → 독서 명언 5개가 10초마다
// 은은하게 페이드아웃/인으로 순환한다. 검색창 placeholder(예시 질문)와 역할을 나눴다.
const HERO_TITLES = [
  '오늘은 어떤 책을 읽어볼까요?',
  '지금의 나는 지금까지 내가 읽은 책의 총합이다',
  '알고 싶은 주제나 삶에 대한 질문이 분명하면, 길은 어렵지 않다',
  '질문과 의문이 절실한 주제의 책을 찾아 읽어라',
  '감명 깊은 책은 개별적이고 주관적이다',
  '실천이 없는 지식, 성찰이 없는 사유는 허구다',
] as const
const HERO_ROTATE_MS = 10_000
const HERO_FADE_MS = 700

const heroIndex = ref(0)
const heroVisible = ref(true)
const heroTitle = computed(() => HERO_TITLES[heroIndex.value] ?? HERO_TITLES[0])

let heroTimer: ReturnType<typeof setInterval> | undefined
let heroFadeTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  heroTimer = setInterval(() => {
    heroVisible.value = false
    heroFadeTimer = setTimeout(() => {
      heroIndex.value = (heroIndex.value + 1) % HERO_TITLES.length
      heroVisible.value = true
    }, HERO_FADE_MS)
  }, HERO_ROTATE_MS)
})
onBeforeUnmount(() => {
  if (heroTimer) clearInterval(heroTimer)
  if (heroFadeTimer) clearTimeout(heroFadeTimer)
})

// ── 배열 옵션(QA #15): 대출 가능한 책만 / 인기순(대출 빈도) ─────────────
const availableOnly = ref(false)
const sortPopular = ref(false)
/** '전체' 카테고리에서도 옵션이 켜지면 섹션 대신 평면 목록으로 전환한다. */
const listOptionsActive = computed(() => availableOnly.value || sortPopular.value)

function listQueryParams(): Record<string, string> {
  const params: Record<string, string> = {}
  if (availableOnly.value) params.available = '1'
  if (sortPopular.value) params.sort = 'popular'
  return params
}

// ── 비검색 모드: '전체'는 홈 섹션들, 카테고리·옵션이 있으면 서가 목록 하나 ──────
const { data: shelfBooks, pending: shelfPending } = await useAsyncData<BookWithMeta[]>(
  'home-shelf',
  () => {
    if (activeQuery.value) return Promise.resolve([])
    if (selectedCategory.value === '전체' && !listOptionsActive.value) return Promise.resolve([])
    const params = listQueryParams()
    if (selectedCategory.value !== '전체') params.category = selectedCategory.value
    return api<BookWithMeta[]>('/api/books', { query: params })
  },
  { watch: [selectedCategory, activeQuery, availableOnly, sortPopular] }
)

const { data: homeSections, pending: homeSectionsPending } = await useAsyncData<HomeSectionData[]>(
  'home-sections',
  () =>
    !activeQuery.value && selectedCategory.value === '전체' && !listOptionsActive.value
      ? api<HomeSectionData[]>('/api/home-sections')
      : Promise.resolve([]),
  { watch: [selectedCategory, activeQuery, listOptionsActive] }
)

// ── 검색 모드: 사내 결과 ──────────────────────────────────────────────
const { data: searchResults, pending: searchPending } = await useAsyncData<BookWithMeta[]>(
  'home-search',
  () =>
    activeQuery.value
      ? api<BookWithMeta[]>('/api/books', { query: { query: activeQuery.value, ...listQueryParams() } })
      : Promise.resolve([]),
  { watch: [activeQuery, availableOnly, sortPopular] }
)

// ── 검색 모드: 외부 서점 결과 (사내 0건이면 자동 로드, 있으면 접힌 링크) ─────
const showExternal = ref(false)
const externalPending = ref(false)
const externalLoaded = ref(false)
const externalResults = ref<ExternalBookSearchItem[]>([])

watch(activeQuery, () => {
  showExternal.value = false
  externalLoaded.value = false
  externalResults.value = []
})

async function loadExternal() {
  if (!activeQuery.value || externalPending.value || externalLoaded.value) return
  externalPending.value = true
  try {
    externalResults.value = await api<ExternalBookSearchItem[]>('/api/book-search', {
      query: { query: activeQuery.value },
    })
  } catch {
    externalResults.value = []
  } finally {
    externalPending.value = false
    externalLoaded.value = true
  }
}

watch(
  [searchPending, searchResults],
  ([pending, results]) => {
    if (!activeQuery.value || pending) return
    if ((results?.length ?? 0) === 0) {
      showExternal.value = true
      loadExternal()
    }
  },
  { immediate: true }
)

function toggleExternal() {
  showExternal.value = true
  loadExternal()
}
</script>

<template>
  <div>
    <CommonAppHeader active="home" />
    <div class="wrap">
      <template v-if="!activeQuery">
        <div class="hero">
          <div class="eyebrow">VATECH PEOPLE&rsquo;S BOOKSHELF</div>
          <h1 class="hero-title" :class="{ hidden: !heroVisible }" aria-live="polite">{{ heroTitle }}</h1>
          <CommonSearchBar v-model="searchInput" @submit="submitSearch" />
          <CommonCategoryChips v-model="selectedCategory" />
          <div class="list-options">
            <button type="button" class="opt-chip" :class="{ on: availableOnly }" @click="availableOnly = !availableOnly">
              대출 가능만
            </button>
            <button type="button" class="opt-chip" :class="{ on: sortPopular }" @click="sortPopular = !sortPopular">
              인기순 (대출 많은 책)
            </button>
          </div>
        </div>

        <template v-if="selectedCategory === '전체' && !listOptionsActive">
          <p v-if="homeSectionsPending" class="hint">불러오는 중…</p>
          <template v-else-if="homeSections && homeSections.length">
            <template v-for="section in homeSections" :key="section.key">
              <div class="sec-head">
                <h2>{{ section.title }}</h2>
                <div class="rule" />
              </div>
              <BookShelfRow v-if="section.books.length" :books="section.books" :columns="6" />
              <p v-else class="hint">등록된 책이 없어요.</p>
            </template>
          </template>
          <p v-else class="hint">표시할 섹션이 없어요.</p>
        </template>

        <template v-else>
          <div class="sec-head">
            <h2>{{ selectedCategory === '전체' ? '조건에 맞는 서가' : '이달의 서가' }}</h2>
            <div class="rule" />
            <span class="count">전체 {{ shelfBooks?.length ?? 0 }}권</span>
          </div>
          <p v-if="shelfPending" class="hint">불러오는 중…</p>
          <BookShelfRow v-else-if="shelfBooks && shelfBooks.length" :books="shelfBooks" :columns="6" />
          <p v-else class="hint">등록된 책이 없어요.</p>
        </template>
      </template>

      <template v-else>
        <AiSearchPanel :query="activeQuery" />

        <div class="sec-head">
          <h2>"{{ activeQuery }}" 검색 결과</h2>
          <div class="rule" />
        </div>
        <p v-if="searchPending" class="hint">불러오는 중…</p>
        <div v-else-if="searchResults && searchResults.length" class="results-grid">
          <BookCard v-for="book in searchResults" :key="book.id" :book="book" />
        </div>
        <p v-else class="hint">검색 결과가 없어요.</p>

        <template v-if="!searchPending && searchResults && searchResults.length">
          <p v-if="!showExternal" class="ext-toggle">
            <a href="#" @click.prevent="toggleExternal">외부 서점에서도 찾아보기</a>
          </p>
        </template>

        <template v-if="showExternal">
          <div class="sec-head">
            <h2>{{ searchResults && searchResults.length ? '외부 서점 검색 결과' : '사내에 없어요 — 외부에서 찾았어요' }}</h2>
            <div class="rule" />
          </div>
          <p v-if="externalPending" class="hint">불러오는 중…</p>
          <div v-else-if="externalResults.length" class="ext-grid">
            <BookExternalBookCard v-for="(item, idx) in externalResults" :key="item.isbn13 ?? `ext-${idx}`" :item="item" />
          </div>
          <p v-else class="hint">외부 검색 결과가 없어요.</p>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hero { text-align: center; margin-bottom: 34px; }
.hero h1 { font-family: var(--font-display); font-size: 31px; font-weight: 600; letter-spacing: -0.4px; margin: 10px 0 22px; }
/* 문구 교체 시 은은한 페이드(QA #52). 긴 명언이 두 줄로 접혀도 검색창이 크게 튀지 않게 최소 높이. */
.hero-title { min-height: 1.35em; transition: opacity .7s ease; opacity: 1; word-break: keep-all; }
.hero-title.hidden { opacity: 0; }

.count { font-size: 13px; color: var(--sub); white-space: nowrap; }

/* 옵션 칩은 서가(책 목록) 시작점과 나란히 오른쪽 정렬(QA #41). */
.list-options { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.opt-chip {
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--sub);
  background: var(--card); border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 6px 14px; cursor: pointer;
}
.opt-chip.on { color: var(--red); border-color: var(--red); background: var(--red-tint); }
.hint { color: var(--sub); font-size: 14px; padding: 20px 0; }

.results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 26px 22px; }
.ext-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 26px 22px; }
.ext-toggle { margin: 16px 0 0; font-size: 13.5px; }

@media (max-width: 640px) {
  .hero { margin-bottom: 26px; }
  .hero h1 { font-size: 23px; margin: 8px 0 16px; }
  .list-options { flex-wrap: wrap; justify-content: center; }
  .results-grid, .ext-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 20px 12px; }
}
</style>
