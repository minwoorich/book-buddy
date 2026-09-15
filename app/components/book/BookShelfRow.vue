<script setup lang="ts">
import type { Book } from '#shared/types'

const props = withDefaults(
  defineProps<{
    books: (Book & { avgRating: number | null; reviewCount: number })[]
    columns?: number
  }>(),
  { columns: 6 }
)

// columns는 데스크톱 기준 칸 수 — 태블릿 4칸, 모바일 3칸.
const columns = useShelfColumns(props.columns, Math.min(props.columns, 4), Math.min(props.columns, 3))
const isMobile = useIsMobile()

/**
 * 한 줄에 다 안 들어가면 줄바꿈 대신 옆으로 넘기는 스와이프 서가(QA #75·#81).
 * 모바일은 항상, 그 외 폭에서는 책이 칸 수보다 많을 때만. 칸 폭은 현재 칸 수 기준이라
 * 한 화면에 보이는 권수는 그대로이고 나머지가 오른쪽으로 이어진다.
 */
const swipe = computed(() => isMobile.value || props.books.length > columns.value)
const itemBasis = computed(() => `${100 / columns.value}%`)
const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }))

// ── 마우스 사용자를 위한 좌우 화살표: 보이는 폭의 80%씩 이동. 끝에 닿으면 해당 화살표를 숨긴다. ──
const trackRef = ref<HTMLElement | null>(null)
const canPrev = ref(false)
const canNext = ref(false)

function updateArrows() {
  const el = trackRef.value
  if (!el) return
  canPrev.value = el.scrollLeft > 4
  canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}

function scrollByPage(dir: 1 | -1) {
  const el = trackRef.value
  if (!el) return
  el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
}

watch([swipe, () => props.books.length, columns], async () => {
  await nextTick()
  updateArrows()
})
onMounted(() => {
  void nextTick(updateArrows)
})
</script>

<template>
  <!-- 스와이프 서가: 가로 스크롤 한 줄. 각 칸이 자기 선반 조각을 그려 이어 붙이면 연속된 선반처럼 보인다. -->
  <div v-if="swipe" class="swipe-wrap">
    <button v-show="canPrev && !isMobile" type="button" class="arrow prev" aria-label="이전 책" @click="scrollByPage(-1)">‹</button>
    <div ref="trackRef" class="swipe-track" @scroll.passive="updateArrows">
      <NuxtLink
        v-for="book in books"
        :key="book.id"
        :to="`/books/${book.id}`"
        class="swipe-item"
        :style="{ flexBasis: itemBasis }"
      >
        <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
        <div class="shelf swipe-shelf" />
        <div class="meta">
          <div class="t">{{ book.title }}</div>
          <div class="a">{{ book.author }}</div>
          <span v-if="book.avgRating !== null" class="stars">
            <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z"/></svg>{{ book.avgRating.toFixed(1) }}
          </span>
          <span v-else class="stars">리뷰 없음</span>
        </div>
      </NuxtLink>
    </div>
    <button v-show="canNext && !isMobile" type="button" class="arrow next" aria-label="다음 책" @click="scrollByPage(1)">›</button>
  </div>

  <div v-else class="shelf-row">
    <div class="shelf-grid covers-row" :style="gridStyle">
      <NuxtLink v-for="book in books" :key="book.id" :to="`/books/${book.id}`">
        <BookCoverImage class="hover" :src="book.coverUrl" :alt="book.title" />
      </NuxtLink>
    </div>
    <div class="shelf" />
    <div class="meta-row" :style="gridStyle">
      <div v-for="book in books" :key="book.id" class="meta">
        <div class="t">{{ book.title }}</div>
        <div class="a">{{ book.author }}</div>
        <span v-if="book.avgRating !== null" class="stars">
          <svg viewBox="0 0 24 24" fill="#C9A227"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z"/></svg>{{ book.avgRating.toFixed(1) }}
        </span>
        <span v-else class="stars">리뷰 없음</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.covers-row .cv { aspect-ratio: 500 / 726; width: 100%; }
.shelf { margin: 0 -14px; }
.meta-row { display: grid; gap: 22px; }
.meta { text-align: center; padding-top: 16px; }
.meta .t { font-size: 14.5px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .a { font-size: 13px; color: var(--sub); margin-bottom: 4px; }

/* 스와이프 서가(QA #75·#81): 칸 폭은 칸 수 기준, 스크롤바는 숨기고 스냅으로 칸을 맞춘다. */
.swipe-wrap { position: relative; }
.swipe-track {
  display: flex; gap: 0; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
  margin: 0 -11px; padding: 0 0 6px; scrollbar-width: none;
}
.swipe-track::-webkit-scrollbar { display: none; }
.swipe-item {
  flex: 0 0 auto; scroll-snap-align: start; padding: 0 11px;
  color: inherit; text-decoration: none; display: block; min-width: 0; box-sizing: border-box;
}
.swipe-item .cv { aspect-ratio: 500 / 726; width: 100%; }
.swipe-shelf { margin: 0 -11px; }
.swipe-item .meta { padding-top: 16px; }

.arrow {
  position: absolute; top: 34%; z-index: 2; width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--line-strong); background: rgba(255,255,255,.95); color: var(--ink);
  font-size: 22px; line-height: 1; cursor: pointer; box-shadow: 0 4px 12px rgba(60,48,28,.18);
  display: flex; align-items: center; justify-content: center;
}
.arrow:hover { border-color: var(--red); color: var(--red); }
.arrow.prev { left: -18px; }
.arrow.next { right: -18px; }

@media (max-width: 640px) {
  .shelf-grid, .meta-row { gap: 12px; }
  .meta { padding-top: 12px; }
  .meta .t { font-size: 13px; }
  .meta .a { font-size: 12px; }
  .swipe-track { margin: 0 -16px; padding: 0 10px 6px; }
  .swipe-item { padding: 0 6px; }
  .swipe-shelf { margin: 0 -6px; }
}
</style>
