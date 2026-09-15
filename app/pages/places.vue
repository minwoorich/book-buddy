<script setup lang="ts">
import type { Place } from '#shared/types'
import { VATECH_HQ } from '#shared/constants/company'

type PlaceWithReason = Place & { reason: string }

const api = useApi()
const { user } = useCurrentUser()
const config = useRuntimeConfig()

// ssr:false SPA는 public runtimeConfig가 빌드 시점 값으로 굳으므로(배포 빌드에선 빈 값),
// 서버가 런타임 env에서 읽은 키를 /api/public-config로 받아 보완한다.
const { data: publicConfig } = await useAsyncData<{ kakaoJsKey: string }>(
  'public-config',
  () => $fetch<{ kakaoJsKey: string }>('/api/public-config'),
  { default: () => ({ kakaoJsKey: '' }) }
)
const kakaoJsKey = computed(() => publicConfig.value.kakaoJsKey || config.public.kakaoJsKey || '')

// 카카오 로컬 검색 키가 없어 GET /api/places가 503을 내는 상황(또는 로그인 전)에 보여줄 예시 4곳.
// 바텍네트웍스 본사(동탄) 반경의 실제 장소·좌표라 지도 키만 있으면 실지도에도 그대로 찍힌다.
const FALLBACK_PLACES: PlaceWithReason[] = [
  {
    name: '카페인사이드',
    category: '카페 · 도보 2분',
    address: '경기 화성시 동탄구 삼성1로 209',
    mapx: 1270749129,
    mapy: 372218632,
    lat: 37.22186318777907,
    lng: 127.07491291181383,
    distanceM: 105,
    reason: '본사 바로 앞이라 점심시간에 잠깐 읽고 오기 좋아요.',
  },
  {
    name: '동학산공원',
    category: '공원 · 도보 5분',
    address: '경기 화성시 동탄구 석우동 29-3',
    mapx: 1270786769,
    mapy: 372204227,
    lat: 37.22042267391131,
    lng: 127.07867694735596,
    distanceM: 339,
    reason: '벤치와 그늘이 많아 날씨 좋은 날 에세이·인문 책과 잘 어울려요.',
  },
  {
    name: '하늘빛작은도서관',
    category: '도서관 · 도보 13분',
    address: '경기 화성시 동탄구 동탄반석로 277',
    mapx: 1270752739,
    mapy: 372121289,
    lat: 37.21212892512761,
    lng: 127.07527393360539,
    distanceM: 975,
    reason: '집중해서 완독하고 싶은 날, 퇴근 후 조용히 몰입하기 좋아요.',
  },
  {
    name: '노노카페 노작홍사용문학관점',
    category: '북카페 · 차 6분',
    address: '경기 화성시 동탄구 노작로 206',
    mapx: 1270754926,
    mapy: 372054051,
    lat: 37.20540514802074,
    lng: 127.07549255235276,
    distanceM: 1722,
    reason: '문학관 안 북카페라 팀 북클럽 모임 장소로 좋아요.',
  },
]

const fetchedPlaces = ref<Place[]>([])
const searchQuery = ref('')
const searching = ref(false)
const myLocation = ref<{ lat: number; lng: number } | null>(null)
const locating = ref(false)

/**
 * 장소 목록을 (재)조회한다. 검색어가 있으면 그 키워드로, 내 위치가 있으면 그 좌표 반경에서
 * 거리순으로 찾는다. 초기 로드(silent)의 실패는 예시 폴백으로 조용히 흡수하고,
 * 사용자가 직접 누른 검색의 실패는 알림으로 보여준다.
 */
async function fetchPlaces(opts: { silent?: boolean } = {}) {
  if (!user.value) {
    fetchedPlaces.value = []
    return
  }
  searching.value = true
  try {
    const query: Record<string, string | number> = {}
    const keyword = searchQuery.value.trim()
    if (keyword) query.query = keyword
    if (myLocation.value) {
      query.lat = myLocation.value.lat
      query.lng = myLocation.value.lng
    }
    fetchedPlaces.value = await api<Place[]>('/api/places', { query })
    ranked.value = null
  } catch (e) {
    if (opts.silent) {
      fetchedPlaces.value = []
    } else {
      alert(apiErrorMessage(e))
    }
  } finally {
    searching.value = false
  }
}

onMounted(() => void fetchPlaces({ silent: true }))

/** 브라우저 geolocation으로 내 위치를 얻어 지도에 표시하고, 그 근처를 거리순으로 재검색한다. */
function locateMe() {
  if (locating.value) return
  if (!navigator.geolocation) {
    alert('이 브라우저는 위치 조회를 지원하지 않아요')
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      myLocation.value = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      void fetchPlaces()
    },
    () => {
      locating.value = false
      alert('위치를 가져오지 못했어요. 브라우저의 위치 권한을 확인해주세요.')
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}

// 실제 검색 결과가 하나도 없으면(키 미설정으로 503이거나, 로그인 전) 예시로 대체한다.
const isFallback = computed(() => fetchedPlaces.value.length === 0)

/** AI 추천 요청에 보낼 원본 장소 목록. */
const basePlaces = computed<Place[]>(() => (isFallback.value ? FALLBACK_PLACES : fetchedPlaces.value))

const ranked = ref<PlaceWithReason[] | null>(null)
const aiLoading = ref(false)

const displayList = computed<PlaceWithReason[]>(() => {
  if (ranked.value) return ranked.value
  if (isFallback.value) return FALLBACK_PLACES
  return basePlaces.value.map((p) => ({ ...p, reason: '' }))
})

/** (0,0)은 폴백 예시의 좌표 없음 표시 — 지도 링크를 만들 수 없다. */
function hasCoords(place: Place): boolean {
  return place.lat !== 0 || place.lng !== 0
}

function kakaoMapUrl(place: Place, kind: 'map' | 'to'): string {
  return `https://map.kakao.com/link/${kind}/${encodeURIComponent(place.name)},${place.lat},${place.lng}`
}

function formatDistance(m?: number): string {
  if (!m) return ''
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

async function requestAiRanking() {
  if (aiLoading.value || basePlaces.value.length === 0) return
  aiLoading.value = true
  try {
    const res = await api<{ ranked: PlaceWithReason[] }>('/api/ai/places', {
      method: 'POST',
      body: { places: basePlaces.value },
    })
    ranked.value = res.ranked
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    aiLoading.value = false
  }
}
</script>

<template>
  <div>
    <CommonAppHeader active="places" />
    <div class="wrap">
      <div class="page-head place-head">
        <div>
          <span class="eyebrow">READING SPOTS</span>
          <h1>책 읽기 좋은 장소</h1>
          <p>{{ VATECH_HQ.name }}(동탄) 주변 카페·도서관·공원을 AI가 책 읽기 좋은 순으로 골라드려요</p>
        </div>
        <button
          type="button"
          class="btn primary"
          style="margin-left:auto;"
          :disabled="aiLoading || basePlaces.length === 0"
          @click="requestAiRanking"
        >
          <template v-if="aiLoading">고르는 중...</template>
          <template v-else>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" style="vertical-align:-2px; margin-right:5px;"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
            AI 추천받기
          </template>
        </button>
      </div>

      <div class="search-bar">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="장소 검색 — 예: 동탄 북카페, 화성 도서관"
          :disabled="searching"
          @keyup.enter="fetchPlaces()"
        />
        <button type="button" class="btn" :disabled="searching" @click="fetchPlaces()">
          {{ searching ? '검색 중...' : '검색' }}
        </button>
        <button type="button" class="btn" :disabled="locating" @click="locateMe">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px; margin-right:4px;"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
          {{ locating ? '위치 확인 중...' : '내 위치' }}
        </button>
        <span class="loc-on">{{ myLocation ? '내 위치 기준 거리순' : VATECH_HQ.shortName + ' 기준 거리순' }}</span>
      </div>

      <p v-if="isFallback" class="hint">장소 검색을 사용할 수 없어 예시 장소를 보여드려요.</p>

      <div class="pl-layout">
        <CommonKakaoMap :places="displayList" :app-key="kakaoJsKey" :my-location="myLocation" />

        <div class="plist">
          <div v-for="(place, i) in displayList" :key="place.name" class="place">
            <div class="top">
              <span class="no">{{ i + 1 }}</span>
              <b>{{ place.name }}</b>
              <span class="cat">{{ place.category }}</span>
              <span v-if="place.distanceM" class="dist">{{ formatDistance(place.distanceM) }}</span>
              <span v-if="isFallback" class="badge no" style="margin-left:auto;">예시</span>
            </div>
            <div class="meta">{{ place.address }}</div>
            <div v-if="place.reason" class="why">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5000E" stroke-width="2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
              {{ place.reason }}
            </div>
            <div v-if="hasCoords(place)" class="acts">
              <a :href="kakaoMapUrl(place, 'map')" target="_blank" rel="noopener">카카오맵에서 보기</a>
              <a :href="kakaoMapUrl(place, 'to')" target="_blank" rel="noopener">길찾기</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 지도와 목록을 한 화면 높이(560px)에 맞추고, 목록은 그 안에서 스크롤(QA #58) —
   예전엔 지도 620px + 목록이 끝없이 아래로 늘어나 페이지가 길어졌다. */
.pl-layout { display: flex; gap: 22px; align-items: stretch; height: 560px; }
.pl-layout :deep(.map) { min-height: 0; height: 100%; }
.place-head { display: flex; align-items: flex-end; gap: 20px; }

.search-bar { display: flex; gap: 10px; align-items: center; margin: -14px 0 20px; }
.search-bar input {
  flex: 0 1 340px; padding: 9px 14px; font-size: 14px; font-family: inherit;
  background: var(--card); border: 1px solid var(--line); border-radius: 4px; color: var(--ink);
}
.search-bar input:focus { outline: none; border-color: var(--red); }
.loc-on { font-size: 12px; color: var(--sub); background: var(--red-tint); border-radius: 3px; padding: 4px 10px; }

.plist { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin; }
.place { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 13px 15px; box-shadow: 0 2px 10px rgba(84,70,45,.06); flex-shrink: 0; }
.place .top { display: flex; align-items: baseline; gap: 9px; margin-bottom: 4px; }
.place .no { font-family: var(--font-display); color: var(--red); font-weight: 700; font-size: 16px; }
.place b { font-size: 15.5px; }
.place .cat { font-size: 12px; color: var(--sub); }
.place .dist { font-size: 12px; color: var(--red); font-weight: 700; }
.place .meta { font-size: 12.5px; color: var(--sub); margin-bottom: 8px; }
.place .why { background: var(--red-tint); border-radius: 3px; padding: 8px 11px; font-size: 12.5px; line-height: 1.55; color: #6E3A34; display: flex; gap: 8px; }
.place .why svg { flex-shrink: 0; margin-top: 2px; }
.place .acts { display: flex; gap: 14px; margin-top: 8px; }
.place .acts a { font-size: 12.5px; font-weight: 700; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 1px; }
.place .acts a:hover { color: var(--red); border-color: var(--red); }

.hint { color: var(--sub); font-size: 14px; margin: -18px 0 20px; }

@media (max-width: 900px) {
  .pl-layout { flex-direction: column; height: auto; }
  .pl-layout :deep(.map) { min-height: 380px; height: 380px; width: 100%; }
  .plist { width: 100%; overflow: visible; padding-right: 0; }
}
@media (max-width: 640px) {
  .place-head { flex-wrap: wrap; }
  .place-head .btn { width: 100%; margin-left: 0 !important; }
  .search-bar { flex-wrap: wrap; margin-top: -4px; }
  .search-bar input { flex: 1 1 100%; }
  .pl-layout :deep(.map) { min-height: 300px; height: 300px; }
  .place .top { flex-wrap: wrap; row-gap: 2px; }
  .hint { margin-top: -8px; }
}
</style>
