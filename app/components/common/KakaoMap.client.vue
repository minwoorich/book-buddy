<script setup lang="ts">
import type { Place } from '#shared/types'

// 카카오 지도 JS는 전역 스크립트로 로드되는 SDK라 별도 타입 패키지 없이 window.kakao를
// any로 다룬다(브리프 허용 범위). 이 컴포넌트는 파일명 컨벤션(`.client.vue`)으로 서버에서는
// 아예 렌더되지 않으므로, SSR에서 kakao가 없다는 걱정은 하지 않아도 된다.

const props = defineProps<{
  places: (Place & { reason?: string })[]
  appKey: string
}>()

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

function centerOf(places: Place[]): { lat: number; lng: number } {
  // 용인 수지 근방 기본 좌표(장소가 하나도 없을 때).
  if (places.length === 0) return { lat: 37.3225, lng: 127.0983 }
  const sum = places.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  )
  return { lat: sum.lat / places.length, lng: sum.lng / places.length }
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

function clearMarkers() {
  markers.forEach((m) => m.setMap(null))
  overlays.forEach((o) => o.setMap(null))
  markers = []
  overlays = []
}

/** mapEl에 지도 인스턴스가 없으면 새로 만들고, 있으면 그대로 재사용한다. */
function ensureMap(kakao: any): any {
  if (!mapEl.value || !kakao?.maps) return null
  if (!mapInstance) {
    const c = centerOf(validPlaces.value)
    mapInstance = new kakao.maps.Map(mapEl.value, {
      center: new kakao.maps.LatLng(c.lat, c.lng),
      level: 5,
    })
  }
  return mapInstance
}

/** 현재 validPlaces 기준으로 마커를 전부 지우고 다시 배치한다(순번 = 현재 순서). */
function renderMarkers() {
  const kakao = (window as any).kakao
  const map = ensureMap(kakao)
  if (!map) return

  clearMarkers()
  if (validPlaces.value.length === 0) return

  const c = centerOf(validPlaces.value)
  map.setCenter(new kakao.maps.LatLng(c.lat, c.lng))

  validPlaces.value.forEach((place, i) => {
    const position = new kakao.maps.LatLng(place.lat, place.lng)
    const marker = new kakao.maps.Marker({ position, map, title: place.name })
    const overlay = new kakao.maps.CustomOverlay({
      position,
      content: pinLabelHtml(i + 1),
      yAnchor: 1.1,
      map,
    })
    markers.push(marker)
    overlays.push(overlay)
  })
}

onMounted(async () => {
  if (!props.appKey) {
    scriptFailed.value = true
    return
  }
  try {
    await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${props.appKey}&autoload=false`)
    await new Promise<void>((resolve) => (window as any).kakao.maps.load(() => resolve()))
    await nextTick() // showFallback=false일 때 mapEl이 DOM에 붙을 때까지 대기
    renderMarkers()
  } catch {
    scriptFailed.value = true
  }
})

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
  }
})
</script>

<template>
  <div class="map">
    <div v-if="!showFallback" ref="mapEl" class="map-canvas" />

    <template v-else>
      <div class="roads" />
      <div class="park" />
      <div class="hq" style="left: 44%; top: 42%;">
        <div class="dot" />
        <div class="lbl">바텍 본사</div>
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
      <div class="note">카카오 지도 키가 없어 예시 지도를 표시 중</div>
    </template>
  </div>
</template>

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
</style>
