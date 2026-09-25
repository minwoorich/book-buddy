<script setup lang="ts">
import type { Place, PlaceReviewSummary } from '#shared/types'
import { PLACE_TAGS } from '#shared/constants/placeTags'
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
  /** 호스트가 이 장소를 모임 장소로 고를 수 있을 때의 버튼 라벨 — 없으면 버튼을 숨긴다. */
  clubAction?: string | null
  /** "모임 예정" 배지 문구 — 곧 열리는 모임이 이 장소를 확정했을 때만. */
  upcoming?: string | null
}>()
defineEmits<{ close: []; detail: []; reviews: []; club: [] }>()

const TOP_TAGS = 3

/** 태그 배지에 쓸 집계 — 많은 순 3개. 목록 카드와 같은 규칙. */
const tally = computed(() => {
  const counts = props.summary?.tagCounts ?? {}
  return PLACE_TAGS.map((t) => ({ code: t.code, label: `${t.emoji} ${t.label}`, count: counts[t.code] ?? 0 }))
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
    <p v-if="upcoming" class="upcoming">📖 {{ upcoming }}</p>

    <!-- 후기는 지도를 띄워둔 채 시트로 연다. 예전엔 목록으로 내려가야 해서, 모바일은 페이지가
         통째로 밀려 지도가 화면에서 사라졌다. -->
    <button v-if="summary?.total" type="button" class="reviews" @click="$emit('reviews')">
      <img v-if="summary.photos.length" :src="summary.photos[0]" class="shot" alt="" loading="lazy">
      <span class="body">
        <span class="tag-badges tally">
          <span v-for="t in tally" :key="t.code" class="tag-badge">{{ t.label }} <b>{{ t.count }}</b></span>
        </span>
        <span class="total">
          <template v-if="summary.photoCount">사진 {{ summary.photoCount }}<span class="sep">·</span></template>동료 후기 {{ summary.total }}개 보기
        </span>
      </span>
      <svg class="arr" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
    </button>
    <button v-else-if="place.kakaoId" type="button" class="reviews empty" @click="$emit('reviews')">
      <span class="total">아직 후기가 없어요 — 첫 후기 남기기</span>
      <svg class="arr" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
    </button>

    <div class="acts">
      <button v-if="clubAction" type="button" class="club-pick" @click="$emit('club')">{{ clubAction }}</button>
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
.upcoming { margin: 4px 0 0; font-size: 12.5px; color: var(--red-text, #b3000e); }
.club-pick { font: inherit; font-size: 12.5px; font-weight: 700; color: var(--red); background: transparent; border: 1px solid var(--red); border-radius: 3px; padding: 4px 10px; cursor: pointer; line-height: 1.2; }
.club-pick:hover { background: var(--red); color: #fff; }

/* 후기 줄 — 목록 카드(PlaceReviewPanel)와 같은 한 줄 텍스트 규칙을 쓴다. */
.reviews {
  display: flex; align-items: center; gap: 9px; margin-top: 10px; padding-top: 9px; width: 100%;
  border: 0; border-top: 1px dashed var(--line); background: none;
  font: inherit; text-align: left; cursor: pointer; color: inherit;
}
.reviews:hover .total { color: var(--red); }
.reviews:hover .arr { color: var(--red); }
.reviews:focus-visible { outline: 2px solid var(--red); outline-offset: 3px; border-radius: 3px; }
.reviews .shot { flex: none; width: 36px; height: 36px; object-fit: cover; display: block; border: 1px solid var(--line); border-radius: 3px; }
.reviews .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
/* 지도 위 카드는 높이가 귀하다 — 태그는 한 줄까지만, 넘치면 배지가 스스로 줄어든다. */
.reviews .tally { flex-wrap: nowrap; overflow: hidden; }
.reviews .total { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11.5px; color: var(--sub); }
.reviews .sep { margin: 0 5px; color: var(--line-strong); }
.reviews .arr { flex: none; color: var(--sub); opacity: .7; }
.reviews.empty { align-items: center; }
.reviews.empty .total { flex: 1; }

.acts { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 11px; }
.acts a { font-size: 12.5px; font-weight: 700; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 1px; }
.acts a:hover { color: var(--red); border-color: var(--red); }
/* 옆의 카카오맵·길찾기 링크와 같은 생김새로 둔다 — 이 카드의 주인공은 위의 후기 줄이다. */
.acts .detail {
  margin-left: auto; font: inherit; font-size: 12.5px; color: var(--sub); cursor: pointer;
  background: none; border: 0; padding: 0 0 1px; text-decoration: underline;
}
.acts .detail:hover { color: var(--red); }

/* 모바일: 지도 아래쪽에 가로로 꽉 찬 시트처럼 붙인다. */
@media (max-width: 640px) {
  .summary { left: 10px; right: 10px; bottom: 10px; width: auto; max-width: none; padding: 12px 13px 11px; }
  .acts .detail { margin-left: auto; }
}
</style>
