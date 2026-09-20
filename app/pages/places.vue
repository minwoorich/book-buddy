<script setup lang="ts">
import type { Place, PlaceReviewSummary } from '#shared/types'
import { VATECH_OFFICES, findOffice } from '#shared/constants/company'
import { placeKey } from '#shared/utils/placeKey'
import { cardCoverPx, formatDistance, hasCoords, kakaoMapUrl } from '~/utils/place'
import { scrollWithin } from '~/utils/scrollWithin'

type PlaceWithReason = Place & { reason: string }

const api = useApi()
const { user } = useCurrentUser()
const config = useRuntimeConfig()
const route = useRoute()

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
/** geolocation이 알려준 오차 반경(m). 지도 클릭으로 직접 찍은 위치는 오차가 없으므로 null. */
const accuracyM = ref<number | null>(null)
/** 지도를 눌러 내 위치를 직접 찍는 보정 모드 — 웹의 Wi-Fi/IP 추정이 빗나갈 때 쓰는 탈출구. */
const pickingLocation = ref(false)

// ── 기준 사업장 드롭다운: 바텍네트웍스 본사(기본)·바텍엠시스·바텍이엠엑스. 고르면 그 사업장
// 주변으로 다시 검색하고 지도도 그리로 옮긴다. 내 위치를 잡아둔 상태였다면 사업장 선택이 우선.
/**
 * 책벗이 "엠시스 근처 카페"를 추천하고 넘어온 경우 `?office=msys`로 들어온다. setup 시점에
 * 초기값으로 넣어야 officeKey watcher가 깨어나 기본 사업장으로 다시 검색하는 일이 없다.
 */
function initialOfficeKey(): string {
  const q = route.query.office
  return typeof q === 'string' && VATECH_OFFICES.some((o) => o.key === q) ? q : VATECH_OFFICES[0].key
}

const officeKey = ref(initialOfficeKey())
const office = computed(() => findOffice(officeKey.value))

// ── 책벗 추천 모드: `?picks=1`로 들어오면 거리순 전체 대신 책벗이 추천한 곳만 지도·목록에
// 보여준다. 검색·사업장 변경·내 위치처럼 사용자가 직접 목록을 부르면 자동으로 풀린다.
const { picks, clear: clearPicks } = usePlacePicks()
const pickMode = ref(route.query.picks === '1' && (picks.value?.places.length ?? 0) > 0)
const pickPlaces = computed<Place[]>(() => (pickMode.value ? (picks.value?.places ?? []) : []))
/** 검색 원점: 내 위치가 있으면 내 위치, 없으면 선택한 사업장. */
const origin = computed(() => myLocation.value ?? { lat: office.value.lat, lng: office.value.lng })

watch(officeKey, () => {
  myLocation.value = null
  accuracyM.value = null
  pickingLocation.value = false
  void fetchPlaces()
})

/**
 * 장소 목록을 (재)조회한다. 검색어가 있으면 그 키워드로, 내 위치가 있으면 그 좌표 반경에서
 * 거리순으로 찾는다. 초기 로드(silent)의 실패는 예시 폴백으로 조용히 흡수하고,
 * 사용자가 직접 누른 검색의 실패는 알림으로 보여준다.
 */
async function fetchPlaces(opts: { silent?: boolean } = {}) {
  // 목록을 직접 부르는 순간이 추천 모드를 벗어나는 지점이다(검색·사업장 변경·내 위치·전체 보기).
  pickMode.value = false
  clearPicks()
  if (!user.value) {
    fetchedPlaces.value = []
    return
  }
  searching.value = true
  try {
    const query: Record<string, string | number> = { lat: origin.value.lat, lng: origin.value.lng }
    const keyword = searchQuery.value.trim()
    if (keyword) query.query = keyword
    fetchedPlaces.value = await api<Place[]>('/api/places', { query })
    void fetchReviewSummaries(fetchedPlaces.value)
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

onMounted(() => {
  if (pickMode.value) {
    void fetchReviewSummaries(pickPlaces.value)
    return
  }
  void fetchPlaces({ silent: true })
})

/**
 * 브라우저 geolocation으로 내 위치를 얻어 지도에 표시하고, 그 근처를 거리순으로 재검색한다.
 *
 * 데스크톱 브라우저에는 GPS가 없어 Wi-Fi/IP 추정으로 좌표를 만든다. 그래서 웹에서는 늘 같은
 * 엉뚱한 건물로 찍히는 일이 흔하다(모바일은 정확). 코드로 정확도를 올릴 방법은 없으므로,
 * 받은 오차 반경(coords.accuracy)을 그대로 보여주고 지도 클릭 보정(`pickingLocation`)을
 * 열어 사용자가 직접 바로잡게 한다.
 */
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
      accuracyM.value = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
      // 오차가 크면(데스크톱 Wi-Fi/IP 추정) 보정 모드를 바로 열어준다.
      pickingLocation.value = (accuracyM.value ?? 0) > LOW_ACCURACY_M
      void fetchPlaces()
    },
    () => {
      locating.value = false
      alert('위치를 가져오지 못했어요. 브라우저의 위치 권한을 확인해주세요.')
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  )
}

/** 이 이상 벌어지면 "대략 이 동네" 수준이라 그대로 거리순에 쓰기 어렵다. */
const LOW_ACCURACY_M = 500

/** 오차가 커서 위치를 믿기 어려운 상태 — 안내 문구와 보정 버튼을 띄우는 조건. */
const locationUnreliable = computed(() => (accuracyM.value ?? 0) > LOW_ACCURACY_M)

/** 지도에서 직접 찍은 지점을 내 위치로 삼는다 — 오차 없음으로 취급하고 주변을 다시 검색한다. */
function onPickLocation(loc: { lat: number; lng: number }) {
  myLocation.value = loc
  accuracyM.value = null
  pickingLocation.value = false
  void fetchPlaces()
}

function clearMyLocation() {
  myLocation.value = null
  accuracyM.value = null
  pickingLocation.value = false
  void fetchPlaces()
}

function formatAccuracy(m: number): string {
  return m < 1000 ? `±${Math.round(m)}m` : `±${(m / 1000).toFixed(1)}km`
}

/** 장소 id → 후기 요약. 목록이 바뀔 때마다 한 번에 다시 받는다. */
const reviewSummaries = ref<Map<string, PlaceReviewSummary>>(new Map())

async function fetchReviewSummaries(places: Place[]) {
  const ids = places.map((p) => p.kakaoId).filter((id): id is string => Boolean(id))
  if (ids.length === 0 || !user.value) {
    reviewSummaries.value = new Map()
    return
  }
  try {
    const list = await api<PlaceReviewSummary[]>('/api/place-reviews', { query: { ids: ids.join(',') } })
    reviewSummaries.value = new Map(list.map((s) => [s.kakaoPlaceId, s]))
  } catch {
    // 후기 요약은 부가 정보 — 실패해도 장소 목록은 그대로 보여준다.
    reviewSummaries.value = new Map()
  }
}

function onReviewChanged(summary: PlaceReviewSummary) {
  const next = new Map(reviewSummaries.value)
  next.set(summary.kakaoPlaceId, summary)
  reviewSummaries.value = next
}

// 실제 검색 결과가 하나도 없으면(키 미설정으로 503이거나, 로그인 전) 예시로 대체한다.
// 추천 모드일 땐 fetchedPlaces가 비어 있는 게 정상이므로 예시로 흘러가면 안 된다.
const isFallback = computed(() => !pickMode.value && fetchedPlaces.value.length === 0)

/** 실제 목록(추천 · 검색 결과 · 예시). */
const basePlaces = computed<Place[]>(() => {
  if (pickMode.value) return pickPlaces.value
  return isFallback.value ? FALLBACK_PLACES : fetchedPlaces.value
})

// AI 추천받기 버튼은 뺐다(QA #70) — 장소는 사업장 기준 거리순으로만 보여준다.
const displayList = computed<PlaceWithReason[]>(() => {
  if (isFallback.value) return FALLBACK_PLACES
  return basePlaces.value.map((p) => ({ ...p, reason: '' }))
})

// ── 목록 ↔ 지도 양방향 선택
// 카드를 누르면 지도가 그 핀으로 이동·강조하고, 핀을 누르면 목록이 그 카드로 스크롤·강조한다.
// 양쪽이 같은 장소를 가리키는지는 placeKey 하나로만 판단한다(번호는 정렬이 바뀌면 흔들린다).
const selectedKey = ref<string | null>(null)
const listEl = ref<HTMLElement | null>(null)

function toggleSelect(place: Place) {
  const key = placeKey(place)
  selectedKey.value = selectedKey.value === key ? null : key
}

/** 선택된 장소 — 지도 위 요약 카드의 내용이자, 목록에서 몇 번인지의 기준. */
const selectedIndex = computed(() =>
  selectedKey.value === null ? -1 : displayList.value.findIndex((p) => placeKey(p) === selectedKey.value)
)
const selectedPlace = computed(() => (selectedIndex.value < 0 ? null : displayList.value[selectedIndex.value]!))

function cardEl(key: string): HTMLElement | null {
  return listEl.value?.querySelector<HTMLElement>(`[data-place-key="${CSS.escape(key)}"]`) ?? null
}

/**
 * 지도 핀 클릭 — 지도 위에 요약 카드만 띄운다.
 *
 * 예전에는 목록 카드로 scrollIntoView를 했는데, 그건 창까지 같이 움직인다. 모바일은 지도 아래로
 * 목록이 길게 이어지는 구조라 페이지가 맨 아래까지 내려가 지도가 사라졌다(다시 올려야 했다).
 * PC는 목록이 자체 스크롤 영역이라, 창은 두고 목록 안에서만 보이게 맞춘다.
 */
function onMapSelect(key: string) {
  // 같은 핀을 다시 누르면 카드를 닫는다(목록 카드의 토글과 같은 규칙).
  if (selectedKey.value === key) {
    selectedKey.value = null
    return
  }
  selectedKey.value = key
  void nextTick(() => {
    const el = cardEl(key)
    // 모바일(.plist가 overflow: visible)에서는 컨테이너가 스크롤되지 않으니 그대로 둔다.
    if (el && listEl.value && listEl.value.scrollHeight > listEl.value.clientHeight) {
      scrollWithin(listEl.value, el)
    }
  })
}

/** 요약 카드의 "목록에서 자세히 보기" — 이때만 페이지를 움직인다(사용자가 스스로 누른 경우). */
function showInList() {
  const key = selectedKey.value
  if (!key) return
  const el = cardEl(key)
  if (!el || !listEl.value) return
  if (listEl.value.scrollHeight > listEl.value.clientHeight) scrollWithin(listEl.value, el)
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Esc로 요약 카드 닫기 — 모달은 아니지만 "떠 있는 것은 Esc로 닫힌다"는 기대를 맞춘다. */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedKey.value) selectedKey.value = null
}

/** 좁은 화면에선 카드가 지도 아래를 덮는다 — 지도가 핀을 그만큼 위로 올려 세우게 알려준다. */
const viewportWidth = ref(1280)
const mapCardCover = computed(() => cardCoverPx(viewportWidth.value))
function onResize() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  onResize()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})

// 목록이 통째로 바뀌면(검색·사업장 변경·내 위치) 예전 선택은 의미가 없다.
watch(displayList, () => {
  if (selectedKey.value && !displayList.value.some((p) => placeKey(p) === selectedKey.value)) {
    selectedKey.value = null
  }
})

</script>

<template>
  <div>
    <CommonAppHeader active="places" />
    <div class="wrap">
      <div class="page-head place-head">
        <div>
          <span class="eyebrow">READING SPOTS</span>
          <h1>책 읽기 좋은 장소</h1>
          <p>{{ pickMode ? '책벗이 추천한 장소를 지도에 표시했어요' : `${office.name} 주변 카페·도서관·공원을 가까운 순으로 모았어요` }}</p>
        </div>
      </div>

      <div class="search-bar">
        <label class="office-pick">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 21h18M5 21V5l7-3 7 3v16M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" /></svg>
          <select v-model="officeKey" :disabled="searching" aria-label="기준 사업장">
            <option v-for="o in VATECH_OFFICES" :key="o.key" :value="o.key">{{ o.name }}</option>
          </select>
        </label>
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
        <span class="loc-on">{{ myLocation ? '내 위치 기준 거리순' : office.shortName + ' 기준 거리순' }}</span>
      </div>

      <!-- 웹(데스크톱)은 GPS가 없어 Wi-Fi/IP로 위치를 추정한다 — 오차를 숨기지 않고 드러내고,
           지도 클릭으로 직접 바로잡을 길을 바로 옆에 둔다. -->
      <div v-if="myLocation" class="loc-note" :class="{ warn: locationUnreliable }">
        <template v-if="locationUnreliable">
          <b>내 위치가 {{ formatAccuracy(accuracyM!) }}까지 벗어날 수 있어요.</b>
          <span>PC는 GPS가 없어 Wi-Fi·IP로 추정합니다. 엉뚱한 곳이면 지도를 눌러 직접 지정하세요.</span>
        </template>
        <template v-else-if="accuracyM">
          <span>내 위치 정확도 {{ formatAccuracy(accuracyM) }}</span>
        </template>
        <template v-else>
          <span>지도에서 직접 지정한 위치를 기준으로 보고 있어요</span>
        </template>
        <button type="button" class="loc-act" @click="pickingLocation = !pickingLocation">
          {{ pickingLocation ? '지정 취소' : '지도에서 직접 지정' }}
        </button>
        <button type="button" class="loc-act ghost" @click="clearMyLocation">{{ office.shortName }} 기준으로</button>
      </div>

      <div v-if="pickMode" class="pick-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /></svg>
        <span><b>책벗이 추천한 {{ displayList.length }}곳</b>만 보고 있어요 · {{ office.name }} 기준</span>
        <button type="button" class="pick-exit" @click="fetchPlaces()">주변 전체 보기</button>
      </div>

      <p v-if="isFallback" class="hint">장소 검색을 사용할 수 없어 예시 장소를 보여드려요.</p>

      <div class="pl-layout">
        <!-- 지도와 그 위에 겹치는 요약 카드를 한 덩어리로 묶는다(카드는 position: absolute). -->
        <div class="map-stage">
          <CommonKakaoMap
            :places="displayList"
            :app-key="kakaoJsKey"
            :my-location="myLocation"
            :accuracy-m="accuracyM"
            :base="office"
            :selected="selectedKey"
            :card-cover-px="mapCardCover"
            :picking-location="pickingLocation"
            @select="onMapSelect"
            @pick="onPickLocation"
          />
          <ReadingPlaceSummaryCard
            v-if="selectedPlace"
            :place="selectedPlace"
            :no="selectedIndex + 1"
            :summary="selectedPlace.kakaoId ? (reviewSummaries.get(selectedPlace.kakaoId) ?? null) : null"
            @close="selectedKey = null"
            @detail="showInList"
          />
        </div>

        <div ref="listEl" class="plist">
          <div
            v-for="(place, i) in displayList"
            :key="placeKey(place)"
            class="place"
            :class="{ 'is-selected': selectedKey === placeKey(place) }"
            :data-place-key="placeKey(place)"
          >
            <!-- 카드 윗줄 전체가 지도 연동 버튼이다. 아래의 후기·링크 영역까지 클릭 대상으로
                 만들면 "카카오맵에서 보기"를 누르려다 선택이 토글되는 사고가 난다. -->
            <button type="button" class="top" :aria-pressed="selectedKey === placeKey(place)" @click="toggleSelect(place)">
              <span class="no">{{ i + 1 }}</span>
              <b>{{ place.name }}</b>
              <span class="cat">{{ place.category }}</span>
              <span v-if="place.distanceM" class="dist">{{ formatDistance(place.distanceM) }}</span>
              <span v-if="isFallback" class="badge no" style="margin-left:auto;">예시</span>
            </button>
            <div class="meta">{{ place.address }}</div>
            <div v-if="place.reason" class="why">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="stroke: var(--red-dark)" stroke-width="2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
              {{ place.reason }}
            </div>
            <div v-if="hasCoords(place)" class="acts">
              <a :href="kakaoMapUrl(place, 'map')" target="_blank" rel="noopener">카카오맵에서 보기</a>
              <a :href="kakaoMapUrl(place, 'to')" target="_blank" rel="noopener">길찾기</a>
            </div>
            <ReadingPlaceReviewPanel
              :place="place"
              :summary="place.kakaoId ? (reviewSummaries.get(place.kakaoId) ?? null) : null"
              @changed="onReviewChanged"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 책벗 추천만 보고 있다는 상태 배너 — 전체 목록으로 돌아갈 길을 항상 옆에 둔다. */
.pick-banner {
  display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
  margin: -6px 0 18px; padding: 10px 14px; font-size: 13px; color: var(--ink);
  background: var(--red-tint); border: 1px solid var(--red); border-radius: 4px;
}
.pick-banner svg { color: var(--red); flex-shrink: 0; }
.pick-banner b { font-weight: 700; }
.pick-exit {
  margin-left: auto; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--red);
  background: var(--card); border: 1px solid var(--red); border-radius: 999px; padding: 5px 13px; cursor: pointer;
}
.pick-exit:hover { background: var(--red); color: #fff; }

/* 지도와 목록을 한 화면 높이(560px)에 맞추고, 목록은 그 안에서 스크롤(QA #58) —
   예전엔 지도 620px + 목록이 끝없이 아래로 늘어나 페이지가 길어졌다. */
.pl-layout { display: flex; gap: 22px; align-items: stretch; height: 560px; }
/* 지도 + 그 위 요약 카드를 담는 칸. 카드가 absolute로 얹히니 기준(relative)이 된다. */
.map-stage { position: relative; flex: 1; min-width: 0; display: flex; }
.pl-layout :deep(.map) { min-height: 0; height: 100%; }
.place-head { display: flex; align-items: flex-end; gap: 20px; }

.search-bar { display: flex; gap: 10px; align-items: center; margin: -14px 0 20px; }
.search-bar input {
  flex: 0 1 340px; padding: 9px 14px; font-size: 14px; font-family: inherit;
  background: var(--card); border: 1px solid var(--line); border-radius: 4px; color: var(--ink);
}
.search-bar input:focus { outline: none; border-color: var(--red); }
/* 기준 사업장 드롭다운 — 검색창 왼쪽, 건물 아이콘 + select */
.office-pick { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1px solid var(--line-strong); border-radius: 4px; padding: 0 10px; color: var(--ink); }
.office-pick svg { color: var(--red); flex-shrink: 0; }
.office-pick select { border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; font-weight: 700; color: var(--ink); padding: 9px 0; cursor: pointer; }
.loc-on { font-size: 12px; color: var(--sub); background: var(--red-tint); border-radius: 3px; padding: 4px 10px; }

/* 내 위치 정확도 안내 — 오차가 크면(웹 Wi-Fi/IP 추정) 붉게 띄워 보정을 유도한다. */
.loc-note {
  display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
  margin: -12px 0 18px; padding: 9px 13px; font-size: 12.5px; color: var(--sub);
  background: var(--card); border: 1px solid var(--line); border-radius: 4px;
}
.loc-note.warn { background: var(--red-tint); border-color: var(--red); color: var(--red-text); }
.loc-note b { font-weight: 700; color: var(--ink); }
.loc-note.warn b { color: var(--red-text); }
.loc-act {
  font: inherit; font-size: 12px; font-weight: 700; color: var(--red); cursor: pointer;
  background: var(--card); border: 1px solid var(--red); border-radius: 999px; padding: 4px 12px;
}
.loc-act:first-of-type { margin-left: auto; }
.loc-act:hover { background: var(--red); color: #fff; }
.loc-act.ghost { color: var(--sub); border-color: var(--line-strong); }
.loc-act.ghost:hover { background: var(--line); color: var(--ink); }

.plist { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin; }
.place { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 13px 15px; box-shadow: 0 2px 10px var(--shadow); flex-shrink: 0; transition: border-color .14s ease, box-shadow .14s ease; }
.place:hover { border-color: var(--line-strong); }
/* 지도 핀과 짝이 맞는다는 표시 — 왼쪽 붉은 띠 + 강조 테두리. */
.place.is-selected { border-color: var(--red); box-shadow: 0 3px 14px rgba(181, 0, 14, .18); }
.place.is-selected .no { background: var(--red); color: #fff; border-radius: 4px; padding: 0 6px; }
/* 카드 윗줄은 button이지만 시각적으로는 원래의 한 줄 그대로다. */
.place .top {
  display: flex; align-items: baseline; gap: 9px; margin-bottom: 4px; width: 100%;
  font: inherit; text-align: left; color: inherit; background: none; border: 0; padding: 0; cursor: pointer;
}
.place .top:focus-visible { outline: 2px solid var(--red); outline-offset: 3px; border-radius: 3px; }
.place .no { font-family: var(--font-display); color: var(--red); font-weight: 700; font-size: 16px; }
.place b { font-size: 15.5px; }
.place .cat { font-size: 12px; color: var(--sub); }
.place .dist { font-size: 12px; color: var(--red); font-weight: 700; }
.place .meta { font-size: 12.5px; color: var(--sub); margin-bottom: 8px; }
.place .why { background: var(--red-tint); border-radius: 3px; padding: 8px 11px; font-size: 12.5px; line-height: 1.55; color: var(--red-text); display: flex; gap: 8px; }
.place .why svg { flex-shrink: 0; margin-top: 2px; }
.place .acts { display: flex; gap: 14px; margin-top: 8px; }
.place .acts a { font-size: 12.5px; font-weight: 700; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 1px; }
.place .acts a:hover { color: var(--red); border-color: var(--red); }

.hint { color: var(--sub); font-size: 14px; margin: -18px 0 20px; }

@media (max-width: 900px) {
  .pl-layout { flex-direction: column; height: auto; }
  .map-stage { flex: none; height: 380px; }
  .pl-layout :deep(.map) { min-height: 380px; height: 380px; width: 100%; }
  .plist { width: 100%; overflow: visible; padding-right: 0; }
}
@media (max-width: 640px) {
  .place-head { flex-wrap: wrap; }
  .place-head .btn { width: 100%; margin-left: 0 !important; }
  .search-bar { flex-wrap: wrap; margin-top: -4px; }
  .office-pick { flex: 1 1 100%; }
  .office-pick select { width: 100%; }
  .search-bar input { flex: 1 1 100%; }
  .map-stage { height: 300px; }
  .pl-layout :deep(.map) { min-height: 300px; height: 300px; }
  .place .top { flex-wrap: wrap; row-gap: 2px; }
  .hint { margin-top: -8px; }
}
</style>
