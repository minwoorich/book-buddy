<script setup lang="ts">
import type { Place, PlaceReviewSummary } from '#shared/types'
import { PLACE_TAGS } from '#shared/constants/placeTags'

/**
 * 목록 카드 아래에 붙는 후기 한 줄 — 여기서는 "신호"만 준다.
 *
 * 예전에는 이 자리에 집계 칩·코멘트 2줄·작성 폼이 다 들어 있었다. 카드가 길어져 PC 목록(560px
 * 스크롤 칸)엔 두세 장밖에 안 보였고, 모바일은 지도 아래로 페이지가 한없이 늘어났다.
 * 폼과 전체 후기는 시트(PlaceReviewSheet)로 옮기고, 여기엔 태그 집계·사진·최근 한 줄만 남겼다.
 *
 * 태그는 이모지 + 연한 빨강 배지(전역 `.tag-badge`)다. 글자만 나란히 두면 어디부터 어디까지가
 * 한 태그인지 흐려 한 덩어리로 읽힌다. 자리가 모자라면 컨테이너가 배지를 반토막 내는 게 아니라
 * 배지가 제 글자를 말줄임으로 줄인다 — 예전에 태그가 "채…"로 깨지던 게 그 반대 경우였다.
 */
const props = defineProps<{
  place: Place
  /** 목록 화면이 일괄 조회해 넘긴 요약. 아직 안 왔으면 null. */
  summary: PlaceReviewSummary | null
}>()
defineEmits<{ open: [] }>()

const TOP_TAGS = 3

/** 태그 배지에 쓸 집계 — 많은 순 3개. 동률은 태그 정의 순서. */
const tally = computed(() => {
  const counts = props.summary?.tagCounts ?? {}
  return PLACE_TAGS.map((t) => ({ code: t.code, label: `${t.emoji} ${t.label}`, count: counts[t.code] ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TAGS)
})

const total = computed(() => props.summary?.total ?? 0)
const photo = computed(() => props.summary?.photos[0] ?? null)
const photoCount = computed(() => props.summary?.photoCount ?? 0)
/** 카드에 한 줄만 보여줄 최근 코멘트. 나머지는 시트에서 읽는다. */
const latest = computed(() => props.summary?.recent[0] ?? null)
</script>

<template>
  <!-- 카카오 id가 없는 장소(폴백 예시)는 후기를 붙일 키가 없다 -->
  <div v-if="place.kakaoId" class="prv">
    <!-- 줄 전체가 시트를 여는 버튼이다 — 태그·사진·코멘트 어디를 눌러도 후기로 들어간다. -->
    <button v-if="total > 0" type="button" class="prv-line" @click="$emit('open')">
      <img v-if="photo" :src="photo" class="shot" alt="" loading="lazy">
      <span class="body">
        <span class="tag-badges tally">
          <span v-for="t in tally" :key="t.code" class="tag-badge">{{ t.label }} <b>{{ t.count }}</b></span>
        </span>
        <span v-if="latest" class="say">“{{ latest.comment }}”</span>
      </span>
      <span class="go">
        <template v-if="photoCount">사진 {{ photoCount }}<span class="sep">·</span></template>후기 {{ total }}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
      </span>
    </button>

    <button v-else type="button" class="prv-empty" @click="$emit('open')">
      아직 후기가 없어요 — 첫 후기를 남겨보세요
    </button>
  </div>
</template>

<style scoped>
.prv { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }

.prv-line {
  width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
  font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer;
}
.prv-line:hover .go { color: var(--red); }
.prv-line:focus-visible { outline: 2px solid var(--red); outline-offset: 3px; border-radius: 3px; }

.shot { flex: none; width: 44px; height: 44px; object-fit: cover; display: block; border: 1px solid var(--line); border-radius: 3px; }

.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
/*
 * 태그 줄(.tag-badges)도 코멘트도 한 줄에 가둔다 — 카드 높이가 후기 길이나 태그 수에 휘둘리면
 * 목록에 몇 장 안 들어간다(이게 예전 카드가 길었던 이유다). 태그는 배지가 스스로 줄어들고,
 * 코멘트는 말줄임으로 잘린다.
 */
.tally { flex-wrap: nowrap; overflow: hidden; }
.say { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; color: var(--muted); }

.go { flex: none; display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--sub); }
.sep { margin: 0 5px; color: var(--line-strong); }
.go svg { opacity: .7; }

.prv-empty {
  width: 100%; text-align: left; font: inherit; font-size: 12.5px; color: var(--sub);
  background: none; border: 0; padding: 0; cursor: pointer;
}
.prv-empty:hover { color: var(--red); }
</style>
