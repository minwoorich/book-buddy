<script setup lang="ts">
import type { Place } from '#shared/types'
import { VATECH_HQ, type VatechOffice } from '#shared/constants/company'

// 카카오 지도 JS는 전역 스크립트로 로드되는 SDK라 별도 타입 패키지 없이 window.kakao를
// any로 다룬다(브리프 허용 범위). 이 컴포넌트는 파일명 컨벤션(`.client.vue`)으로 서버에서는
// 아예 렌더되지 않으므로, SSR에서 kakao가 없다는 걱정은 하지 않아도 된다.

const props = defineProps<{
  places: (Place & { reason?: string })[]
  appKey: string
  /** 사용자의 현재 위치(브라우저 geolocation). 오면 파란 점으로 표시하고 지도를 이동한다. */
  myLocation?: { lat: number; lng: number } | null
  /** 기준 사업장(드롭다운 선택). 지도 기본 중심이자 상시 마커. 없으면 바텍네트웍스 본사. */
  base?: VatechOffice
}>()

const base = computed<VatechOffice>(() => props.base ?? VATECH_HQ)

/** 목업(places.html)의 4개 고정 핀 좌표. 폴백 렌더링에서 최대 4곳까지만 그대로 사용한다. */
const FALLBACK_PIN_POSITIONS = [
  { left: '58%', top: '22%' },
  { left: '25%', top: '33%' },
  { left: '13%', top: '66%' },
  { left: '66%', top: '58%' },
] as const

const mapEl = ref<HTMLElement | null>(null)
/** 스크립트 로드 실패 또는 appKey 없음 — 이 경우에만 영구 폴백(래치)한다. */
const scriptFailed = ref(false)
/** 폴백 사유: 'no-key' | 'load-failed' | '' — 안내 문구 구분용. */
const fallbackReason = ref<'no-key' | 'load-failed' | ''>('')

const fallbackPlaces = computed(() => props.places.slice(0, 4))

/**
 * 좌표가 없는(또는 (0,0)인) 장소는 실지도에 올리지 않는다. 정적 폴백 장소(places.vue의
 * 예시 4곳)는 lat/lng을 0으로 채워두므로, 이 필터가 없으면 카카오 지도 키는 있지만 검색
 * 키가 없는 조합에서 마커/중심이 전부 "Null Island"(0,0)에 찍히는 문제가 생긴다. 이 필터
 * 덕분에 컴포넌트는 데이터가 실제 검색 결과인지 정적 폴백인지 몰라도 안전하다.
 */
const validPlaces = computed(() =>
  props.places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0))
)

/**
 * 폴백 여부는 매번 재평가한다(래치 금지). 스크립트 로드 실패/appKey 없음만 영구 폴백이고,
 * "지금 유효한 장소가 없다"는 이후 props.places가 바뀌면 다시 실지도로 돌아와야 한다.
 */
const showFallback = computed(() => scriptFailed.value || validPlaces.value.length === 0)

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).kakao?.maps) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('카카오 지도 스크립트 로드 실패')))
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('카카오 지도 스크립트 로드 실패'))
    document.head.appendChild(script)
  })
}

/** 두 좌표 사이 대략 거리(km) — 본사를 화면에 함께 담을지 판단하는 용도라 정밀할 필요는 없다. */
function roughKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/** 본사(HQ)를 화면에 같이 담을 만큼 가까운 장소가 하나라도 있는지 판단하는 반경. 먼 지역 키워드 검색이면 제외. */
const HQ_INCLUDE_RADIUS_KM = 10

/**
 * 기준 사업장 마커 — 장소 핀(파란 마커+붉은 번호)과 확실히 구분되도록 크게: 붉은 펄스 링 위에
 * 검정 사각 코어, 그 아래 흰 바탕·붉은 테두리의 이름 라벨. 지도 어디서든 눈에 띈다.
 */
function officeLabelHtml(office: VatechOffice): string {
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;">' +
    '<div style="position:relative;width:44px;height:44px;">' +
    '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(230,0,18,.22);animation:bb-pulse 2s ease-out infinite;"></div>' +
    '<div style="position:absolute;inset:8px;border-radius:50%;background:#fff;border:3px solid #E60012;box-shadow:0 3px 10px rgba(181,0,14,.45);display:flex;align-items:center;justify-content:center;">' +
    '<div style="width:12px;height:12px;background:#221D15;border-radius:2px;"></div>' +
    '</div></div>' +
    '<div style="font-size:13px;font-weight:800;letter-spacing:-0.2px;background:#fff;color:#221D15;border:2px solid #E60012;border-radius:999px;padding:4px 12px;white-space:nowrap;box-shadow:0 4px 12px rgba(60,48,28,.25);">' +
    office.name +
    '</div></div>'
  )
}

function pinLabelHtml(no: number): string {
  return (
    '<div style="width:26px;height:26px;background:#E60012;border-radius:50% 50% 50% 0;' +
    'transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;' +
    'box-shadow:0 3px 8px rgba(181,0,14,.4);">' +
    `<span style="transform:rotate(45deg);color:#fff;font-size:12px;font-weight:800;">${no}</span>` +
    '</div>'
  )
}

// 지도 인스턴스/마커·오버레이는 반응형일 필요가 없다(kakao SDK 객체) — 일반 변수로 들고 재사용한다.
let mapInstance: any = null
let markers: any[] = []
let overlays: any[] = []
let myLocationOverlay: any = null
let hqOverlay: any = null

function clearMarkers() {
  markers.forEach((m) => m.setMap(null))
  overlays.forEach((o) => o.setMap(null))
  markers = []
  overlays = []
}

/** 장소를 카카오맵(새 탭)으로 연다 — 마커/순번 클릭용. */
function openInKakaoMap(place: Place) {
  window.open(
    `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`,
    '_blank',
    'noopener'
  )
}

/** 내 위치 파란 점 오버레이를 (재)배치한다. pan=true면 지도를 그 지점으로 이동한다. */
function renderMyLocation(pan = false) {
  const kakao = (window as any).kakao
  const map = ensureMap(kakao)
  if (!map) return

  if (myLocationOverlay) {
    myLocationOverlay.setMap(null)
    myLocationOverlay = null
  }
  const loc = props.myLocation
  if (!loc) return

  const position = new kakao.maps.LatLng(loc.lat, loc.lng)
  myLocationOverlay = new kakao.maps.CustomOverlay({
    position,
    content:
      '<div style="position:relative;width:18px;height:18px;">' +
      '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(38,110,255,.25);animation:bb-pulse 1.8s ease-out infinite;"></div>' +
      '<div style="position:absolute;inset:4px;border-radius:50%;background:#266EFF;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>' +
      '</div>',
    map,
    zIndex: 10,
  })
  if (pan) map.panTo(position)
}

/** mapEl에 지도 인스턴스가 없으면 새로 만들고, 있으면 그대로 재사용한다. */
function ensureMap(kakao: any): any {
  if (!mapEl.value || !kakao?.maps) return null
  if (!mapInstance) {
    // 지도는 선택된 사업장(기본: 바텍네트웍스 본사)을 중심으로 연다. 장소가 오면 renderMarkers가 범위를 맞춘다.
    mapInstance = new kakao.maps.Map(mapEl.value, {
      center: new kakao.maps.LatLng(base.value.lat, base.value.lng),
      level: 4,
    })
    renderOfficeMarker(kakao, mapInstance)
  }
  return mapInstance
}

/** 기준 사업장 마커를 (재)배치한다 — 사업장이 바뀌면 라벨·위치를 갈아 끼운다. */
function renderOfficeMarker(kakao: any, map: any) {
  if (hqOverlay) hqOverlay.setMap(null)
  hqOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(base.value.lat, base.value.lng),
    content: officeLabelHtml(base.value),
    yAnchor: 0.35,
    map,
    zIndex: 20,
  })
}

/** 현재 validPlaces 기준으로 마커를 전부 지우고 다시 배치한다(순번 = 현재 순서). */
function renderMarkers() {
  const kakao = (window as any).kakao
  const map = ensureMap(kakao)
  if (!map) return

  clearMarkers()
  if (validPlaces.value.length === 0) {
    map.setCenter(new kakao.maps.LatLng(base.value.lat, base.value.lng))
    map.setLevel(4)
    return
  }

  // 사업장 근처 장소가 있으면 사업장까지 한 화면에 담고, 먼 지역 검색이면 장소들만 담는다.
  const bounds = new kakao.maps.LatLngBounds()
  const nearHq = validPlaces.value.some((p) => roughKm(p, base.value) <= HQ_INCLUDE_RADIUS_KM)
  if (nearHq) bounds.extend(new kakao.maps.LatLng(base.value.lat, base.value.lng))
  validPlaces.value.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)))
  map.setBounds(bounds, 40)

  validPlaces.value.forEach((place, i) => {
    const position = new kakao.maps.LatLng(place.lat, place.lng)
    const marker = new kakao.maps.Marker({ position, map, title: place.name })
    kakao.maps.event.addListener(marker, 'click', () => openInKakaoMap(place))
    const overlay = new kakao.maps.CustomOverlay({
      position,
      content: pinLabelHtml(i + 1),
      yAnchor: 1.1,
      map,
    })
    markers.push(marker)
    overlays.push(overlay)
  })

  // 내 위치 점은 마커 목록과 별개로 유지한다(목록이 갈려도 사라지면 안 된다).
  renderMyLocation()
}

async function initMap(): Promise<void> {
  if (!props.appKey) {
    scriptFailed.value = true
    fallbackReason.value = 'no-key'
    return
  }
  try {
    await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${props.appKey}&autoload=false`)
    await new Promise<void>((resolve) => (window as any).kakao.maps.load(() => resolve()))
    await nextTick() // showFallback=false일 때 mapEl이 DOM에 붙을 때까지 대기
    scriptFailed.value = false
    fallbackReason.value = ''
    renderMarkers()
  } catch (e) {
    // 도메인 미등록(domain mismatched)·잘못된 키 등 — 원인을 콘솔에 남겨 진단 가능하게 한다.
    console.error('[KakaoMap] SDK 로드 실패:', e)
    scriptFailed.value = true
    fallbackReason.value = 'load-failed'
  }
}

onMounted(initMap)

// appKey가 비동기로 도착하는 경우(/api/public-config 런타임 조회) 재시도한다 —
// mount 시점엔 빈 값이라 폴백에 빠졌더라도, 키가 오면 실지도로 전환한다.
watch(
  () => props.appKey,
  (key, prev) => {
    if (key && !prev) void initMap()
  }
)

// places.vue가 AI 추천 후 displayList(= props.places)를 교체하는 등 목록이 바뀔 때마다
// 마커를 다시 배치한다(순번이 우측 리스트와 항상 일치하도록). 지도 인스턴스는 재사용한다.
watch(validPlaces, async () => {
  if (showFallback.value) return
  await nextTick()
  renderMarkers()
})

// 폴백으로 전환되면(유효한 장소가 0개) mapEl div가 v-if로 언마운트되므로, 다음에 다시
// 실지도로 돌아올 때 새 DOM 노드에 대해 지도를 새로 만들도록 인스턴스 참조를 정리한다.
watch(showFallback, (isFallback) => {
  if (isFallback) {
    mapInstance = null
    markers = []
    overlays = []
    myLocationOverlay = null
    hqOverlay = null
  }
})

// 기준 사업장이 바뀌면 마커를 옮기고 그 사업장으로 이동한다(장소 목록은 places.vue가 다시 조회해 온다).
watch(base, () => {
  if (showFallback.value) return
  const kakao = (window as any).kakao
  const map = ensureMap(kakao)
  if (!map) return
  renderOfficeMarker(kakao, map)
  map.setCenter(new kakao.maps.LatLng(base.value.lat, base.value.lng))
  map.setLevel(4)
})

// 내 위치가 도착/갱신되면 파란 점을 다시 그리고 그 지점으로 이동한다.
watch(
  () => props.myLocation,
  () => {
    if (showFallback.value) return
    renderMyLocation(true)
  }
)
</script>

<template>
  <div class="map">
    <div v-if="!showFallback" ref="mapEl" class="map-canvas" />

    <template v-else>
      <div class="roads" />
      <div class="park" />
      <div class="hq" style="left: 44%; top: 42%;">
        <div class="dot" />
        <div class="lbl">{{ base.shortName }}</div>
      </div>
      <div
        v-for="(place, i) in fallbackPlaces"
        :key="place.name"
        class="pin"
        :style="{ left: FALLBACK_PIN_POSITIONS[i]?.left, top: FALLBACK_PIN_POSITIONS[i]?.top }"
      >
        <div class="head"><span>{{ i + 1 }}</span></div>
        <div class="lbl">{{ place.name }}</div>
      </div>
      <div class="note">{{
        fallbackReason === 'load-failed'
          ? '카카오 지도를 불러오지 못해 예시 지도를 표시 중 (콘솔 확인 · 카카오 콘솔의 Web 도메인 등록 필요)'
          : fallbackReason === 'no-key'
            ? '카카오 지도 키가 없어 예시 지도를 표시 중'
            : '표시할 장소가 없어 예시 지도를 표시 중'
      }}</div>
    </template>
  </div>
</template>

<style>
/* 내 위치 오버레이는 카카오 SDK가 body 아래 DOM으로 주입하므로 전역 keyframes가 필요하다. */
@keyframes bb-pulse {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(2.4); opacity: 0; }
}
</style>

<style scoped>
.map { flex: 1; min-height: 620px; background: #EFE9DC; border: 1px solid var(--line); border-radius: 4px; position: relative; overflow: hidden; }
.map-canvas { position: absolute; inset: 0; }
.roads {
  position: absolute; inset: 0;
  background:
    linear-gradient(90deg, transparent 118px, #E3DCCB 118px, #E3DCCB 126px, transparent 126px),
    linear-gradient(0deg, transparent 210px, #E3DCCB 210px, #E3DCCB 220px, transparent 220px),
    linear-gradient(90deg, transparent 388px, #E6DFCE 388px, #E6DFCE 394px, transparent 394px),
    linear-gradient(0deg, transparent 430px, #E6DFCE 430px, #E6DFCE 436px, transparent 436px),
    linear-gradient(35deg, transparent 49.6%, #E3DCCB 49.6%, #E3DCCB 50.4%, transparent 50.4%);
}
.park { position: absolute; left: 8%; bottom: 12%; width: 150px; height: 110px; background: #DFE5CE; border-radius: 50% 40% 55% 45%; }
.note { position: absolute; right: 14px; bottom: 12px; font-size: 11.5px; color: var(--sub); background: rgba(255,253,249,.9); border: 1px solid var(--line); border-radius: 3px; padding: 4px 10px; }
.hq { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.hq .dot { width: 14px; height: 14px; background: var(--ink); border-radius: 3px; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
.hq .lbl { font-size: 11px; font-weight: 700; background: var(--ink); color: #fff; border-radius: 3px; padding: 2px 8px; }
.pin { position: absolute; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
.pin .head { width: 26px; height: 26px; background: var(--red); border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(181,0,14,.4); }
.pin .head span { transform: rotate(45deg); color: #fff; font-size: 12px; font-weight: 800; }
.pin .lbl { margin-top: 5px; font-size: 11.5px; font-weight: 700; background: rgba(255,253,249,.95); border: 1px solid var(--line); border-radius: 3px; padding: 2px 8px; white-space: nowrap; }

@media (max-width: 900px) {
  .map { min-height: 380px; }
}
@media (max-width: 640px) {
  .map { min-height: 300px; }
  .note { font-size: 10.5px; right: 8px; bottom: 8px; }
}
</style>
