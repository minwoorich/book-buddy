<script setup lang="ts">
import type { Place, PlaceReviewSummary } from '#shared/types'
import { PLACE_TAGS, PLACE_TAG_LABEL } from '#shared/constants/placeTags'
import { formatDistance, hasCoords, kakaoMapUrl } from '~/utils/place'

/**
 * 지도에서 핀을 눌렀을 때 지도 위에 겹쳐 뜨는 장소 요약(네이버지도식).
 *
 * 예전에는 핀을 누르면 목록의 해당 카드로 스크롤했는데, 모바일은 지도 아래에 목록이 길게
 * 이어지는 구조라 페이지가 통째로 내려가 지도가 화면에서 사라졌다. 지도를 그대로 둔 채
 * 핵심 정보만 여기서 보여주고, 목록으로 내려가는 건 사용자가 버튼을 누를 때만 한다.
 */
const props = defineProps<{
  place: Place
  /** 목록에서의 번호 — 지도 핀에 찍힌 숫자와 같다. */
  no: number
  summary: PlaceReviewSummary | null
}>()
defineEmits<{ close: []; detail: [] }>()

const TOP_TAGS = 2

/** 동료 후기 태그 중 많이 붙은 순 2개. */
const topTags = computed(() => {
  const counts = props.summary?.tagCounts ?? {}
  return PLACE_TAGS.map((t) => ({ code: t.code, count: counts[t.code] ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TAGS)
})
</script>

<template>
  <div class="summary" role="dialog" :aria-label="`${place.name} 요약`">
    <button type="button" class="x" aria-label="닫기" @click="$emit('close')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>

    <div class="head">
      <span class="no">{{ no }}</span>
      <b>{{ place.name }}</b>
      <span class="cat">{{ place.category }}</span>
      <span v-if="place.distanceM" class="dist">{{ formatDistance(place.distanceM) }}</span>
    </div>
    <p class="addr">{{ place.address }}</p>

    <div v-if="summary?.total" class="reviews">
      <span v-for="t in topTags" :key="t.code" class="tag">{{ PLACE_TAG_LABEL[t.code] }} {{ t.count }}</span>
      <span class="total">동료 후기 {{ summary.total }}개</span>
    </div>

    <div class="acts">
      <template v-if="hasCoords(place)">
        <a :href="kakaoMapUrl(place, 'map')" target="_blank" rel="noopener">카카오맵</a>
        <a :href="kakaoMapUrl(place, 'to')" target="_blank" rel="noopener">길찾기</a>
      </template>
      <button type="button" class="detail" @click="$emit('detail')">목록에서 자세히 보기</button>
    </div>
  </div>
</template>

<style scoped>
.summary {
  position: absolute; left: 14px; bottom: 14px; z-index: 5; width: 300px; max-width: calc(100% - 28px);
  background: var(--card); border: 1px solid var(--line-strong); border-radius: 6px;
  padding: 13px 15px 12px; box-shadow: 0 10px 30px var(--shadow-strong);
}
.x { position: absolute; top: 8px; right: 8px; border: 0; background: none; color: var(--sub); cursor: pointer; padding: 4px; line-height: 0; }
.x:hover { color: var(--ink); }

.head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding-right: 22px; }
.head .no { font-family: var(--font-display); color: #fff; background: var(--red); border-radius: 4px; padding: 0 6px; font-weight: 700; font-size: 14px; }
.head b { font-size: 15px; }
.head .cat { font-size: 12px; color: var(--sub); }
.head .dist { font-size: 12px; color: var(--red); font-weight: 700; }
.addr { margin: 6px 0 0; font-size: 12.5px; color: var(--sub); }

.reviews { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
.reviews .tag { font-size: 11.5px; font-weight: 700; color: var(--red-text); background: var(--red-tint); border-radius: 999px; padding: 3px 9px; }
.reviews .total { font-size: 11.5px; color: var(--sub); }

.acts { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 11px; }
.acts a { font-size: 12.5px; font-weight: 700; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 1px; }
.acts a:hover { color: var(--red); border-color: var(--red); }
.acts .detail {
  margin-left: auto; font: inherit; font-size: 12px; font-weight: 700; color: var(--red); cursor: pointer;
  background: var(--card); border: 1px solid var(--red); border-radius: 999px; padding: 5px 12px;
}
.acts .detail:hover { background: var(--red); color: #fff; }

/* 모바일: 지도 아래쪽에 가로로 꽉 찬 시트처럼 붙인다. */
@media (max-width: 640px) {
  .summary { left: 10px; right: 10px; bottom: 10px; width: auto; max-width: none; padding: 12px 13px 11px; }
  .acts .detail { margin-left: 0; width: 100%; text-align: center; }
}
</style>
