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
/** 타자기 효과(QA #74): 한 글자씩 나타나고, 문구가 바뀔 땐 지운 뒤 다시 친다. */
const HERO_TYPE_MS = 55
const HERO_ERASE_MS = 18

const heroIndex = ref(0)
const heroTyped = ref(HERO_TITLES[0].length) // 첫 화면은 완성된 문구로 시작(깜빡임 방지)
const heroTitle = computed(() => HERO_TITLES[heroIndex.value] ?? HERO_TITLES[0])
const heroText = computed(() => heroTitle.value.slice(0, heroTyped.value))
const heroTyping = computed(() => heroTyped.value < heroTitle.value.length)

let heroTimer: ReturnType<typeof setInterval> | undefined
let heroStepTimer: ReturnType<typeof setTimeout> | undefined

function typeNext() {
  if (heroTyped.value >= heroTitle.value.length) return
  heroTyped.value++
  heroStepTimer = setTimeout(typeNext, HERO_TYPE_MS)
}

function eraseThenType() {
  if (heroTyped.value > 0) {
    heroTyped.value--
    heroStepTimer = setTimeout(eraseThenType, HERO_ERASE_MS)
    return
  }
  heroIndex.value = (heroIndex.value + 1) % HERO_TITLES.length
  heroStepTimer = setTimeout(typeNext, 200)
}

onMounted(() => {
  heroTimer = setInterval(() => {
    if (heroStepTimer) clearTimeout(heroStepTimer)
    eraseThenType()
  }, HERO_ROTATE_MS)
})
onBeforeUnmount(() => {
  if (heroTimer) clearInterval(heroTimer)
  if (heroStepTimer) clearTimeout(heroStepTimer)
})

// ── 배열 옵션(QA #15 → #66·#73): "대출 가능만" 토글 스위치 + 정렬 세그먼트(기본순/인기순) ──
const availableOnly = ref(false)
const sortMode = ref<'default' | 'popular'>('default')
const sortPopular = computed(() => sortMode.value === 'popular')
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
          <h1 class="hero-title" :aria-label="heroTitle"><span aria-hidden="true">{{ heroText }}</span><span class="caret" :class="{ typing: heroTyping }" aria-hidden="true" /></h1>
          <CommonSearchBar v-model="searchInput" @submit="submitSearch" />
          <CommonCategoryChips v-model="selectedCategory" />
          <div class="list-options">
            <label class="switch">
              <input v-model="availableOnly" type="checkbox">
              <span class="track"><span class="knob" /></span>
              <span class="switch-label">대출 가능만</span>
            </label>
            <div class="seg" role="radiogroup" aria-label="정렬">
              <button type="button" role="radio" :aria-checked="sortMode === 'default'" :class="{ on: sortMode === 'default' }" @click="sortMode = 'default'">기본순</button>
              <button type="button" role="radio" :aria-checked="sortMode === 'popular'" :class="{ on: sortMode === 'popular' }" @click="sortMode = 'popular'">인기순</button>
            </div>
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
/* 타자기 효과(QA #74). 긴 명언이 두 줄로 접혀도 검색창이 크게 튀지 않게 최소 높이. */
.hero-title { min-height: 1.35em; word-break: keep-all; }
.caret { display: inline-block; width: 2px; height: .95em; margin-left: 3px; vertical-align: -0.12em; background: var(--red); opacity: 0; }
.caret.typing { opacity: 1; animation: hero-caret 1s steps(1) infinite; }
@keyframes hero-caret { 50% { opacity: 0; } }

.count { font-size: 13px; color: var(--sub); white-space: nowrap; }

/* 옵션은 얇은 한 줄(QA #73)로 오른쪽 정렬(QA #41), 카테고리 칩과는 간격을 둔다(QA #66). */
.list-options { display: flex; justify-content: flex-end; align-items: center; gap: 18px; margin-top: 22px; height: 26px; }
/* 토글 스위치(QA #66) */
.switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch .track { width: 34px; height: 20px; border-radius: 999px; background: var(--line-strong); position: relative; transition: background .18s; flex-shrink: 0; }
.switch .knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .18s; }
.switch input:checked + .track { background: var(--red); }
.switch input:checked + .track .knob { transform: translateX(14px); }
.switch input:focus-visible + .track { outline: 2px solid var(--red); outline-offset: 2px; }
.switch-label { font-size: 12.5px; font-weight: 600; color: var(--sub); }
.switch input:checked ~ .switch-label { color: var(--ink); }
/* 정렬 세그먼트(기본순/인기순, QA #66) */
.seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 999px; padding: 2px; background: var(--card); }
.seg button { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--sub); background: transparent; border: 0; border-radius: 999px; padding: 3px 12px; cursor: pointer; }
.seg button.on { background: var(--red); color: #fff; }
.hint { color: var(--sub); font-size: 14px; padding: 20px 0; }

.results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 26px 22px; }
.ext-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 26px 22px; }
.ext-toggle { margin: 16px 0 0; font-size: 13.5px; }

@media (max-width: 640px) {
  .hero { margin-bottom: 26px; }
  .hero h1 { font-size: 23px; margin: 8px 0 16px; }
  .list-options { flex-wrap: wrap; justify-content: center; height: auto; gap: 12px; margin-top: 16px; }
  .results-grid, .ext-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 20px 12px; }
}
</style>
