<script setup lang="ts">
import type { Place } from '#shared/types'
import { VATECH_HQ, type VatechOffice } from '#shared/constants/company'
import { toMapPins, deOverlapPoints } from '#shared/utils/placeKey'

// 카카오 지도 JS는 전역 스크립트로 로드되는 SDK라 별도 타입 패키지 없이 window.kakao를
// any로 다룬다(브리프 허용 범위). 이 컴포넌트는 파일명 컨벤션(`.client.vue`)으로 서버에서는
// 아예 렌더되지 않으므로, SSR에서 kakao가 없다는 걱정은 하지 않아도 된다.

const props = defineProps<{
  places: (Place & { reason?: string })[]
  appKey: string
  /** 사용자의 현재 위치(브라우저 geolocation 또는 지도 클릭 보정). 파란 점으로 표시한다. */
  myLocation?: { lat: number; lng: number } | null
  /** geolocation이 알려준 오차 반경(m). 웹은 Wi-Fi/IP 추정이라 km 단위 값이 온다. */
  accuracyM?: number | null
  /** 기준 사업장(드롭다운 선택). 지도 기본 중심이자 상시 마커. 없으면 바텍네트웍스 본사. */
  base?: VatechOffice
  /** 목록에서 선택된 장소의 placeKey — 해당 핀을 키우고 맨 위로 올린다. */
  selected?: string | null
  /** 지도를 클릭해 내 위치를 직접 찍는 보정 모드. */
  pickingLocation?: boolean
}>()

const emit = defineEmits<{
  /** 핀을 눌렀다 — 부모가 우측 목록을 해당 카드로 스크롤·강조한다. */
  (e: 'select', key: string): void
  /** 보정 모드에서 지도를 눌렀다 — 그 좌표를 내 위치로 쓴다. */
  (e: 'pick', loc: { lat: number; lng: number }): void
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
/** kakao.maps.load() 콜백까지 끝나 Map·LatLng 등 클래스를 쓸 수 있는 상태. */
const sdkReady = ref(false)
/** 폴백 사유: 'no-key' | 'load-failed' | '' — 안내 문구 구분용. */
const fallbackReason = ref<'no-key' | 'load-failed' | ''>('')

const fallbackPlaces = computed(() => props.places.slice(0, 4))

/**
 * 지도에 올릴 장소 + 그 장소의 **우측 목록 번호**.
 *
 * 번호를 이 배열 안에서 다시 매기면 안 된다. 좌표 없는 장소가 하나라도 걸러지는 순간 그 뒤
 * 핀 번호가 통째로 한 칸씩 밀려 목록과 어긋나기 때문이다. 그래서 필터 **전** 원본 인덱스를
 * no로 함께 들고 다닌다.
 *
 * (0,0)인 장소는 실지도에 올리지 않는다. 정적 폴백 장소(places.vue의 예시 4곳)는 lat/lng을
 * 0으로 채워두므로, 이 필터가 없으면 마커가 전부 "Null Island"(0,0)에 찍힌다.
 */
const validPlaces = computed(() => toMapPins(props.places))

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

/** 사업장 마커가 차지하는 반경(px) — 펄스 링 44px + 이름표까지 고려해 핀을 이만큼 비켜 세운다. */
const OFFICE_CLEARANCE_PX = 46

/**
 * 기준 사업장 마커 — 장소 핀과 확실히 구분되도록 크게: 붉은 펄스 링 위에 검정 사각 코어,
 * 그 아래 흰 바탕·붉은 테두리의 이름 라벨. 지도 어디서든 눈에 띈다.
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

/**
 * 번호 핀을 DOM 노드로 만든다.
 *
 * 문자열 content 대신 실제 엘리먼트를 쓰는 이유: CustomOverlay에는 Marker처럼 kakao 이벤트를
 * 붙일 수 없어, 클릭을 받으려면 노드를 직접 쥐고 있어야 한다. 노드를 들고 있으면 선택 상태가
 * 바뀔 때 전체를 다시 그리지 않고 스타일만 갈아 끼울 수 있다는 이점도 있다.
 */
function createPinEl(no: number, name: string, onClick: () => void): HTMLElement {
  const root = document.createElement('div')
  root.className = 'bb-pin'
  root.innerHTML =
    '<div class="bb-pin-head"><span></span></div>' + '<div class="bb-pin-name"></div>'
  root.querySelector<HTMLElement>('.bb-pin-head span')!.textContent = String(no)
  root.querySelector<HTMLElement>('.bb-pin-name')!.textContent = name
  root.addEventListener('click', (ev) => {
    ev.stopPropagation()
    onClick()
  })
  return root
}

/** 선택 상태만 토글한다 — 핀을 새로 만들지 않아 깜빡이지 않는다. */
function setPinSelected(el: HTMLElement, isSelected: boolean) {
  el.classList.toggle('is-selected', isSelected)
}

// 지도 인스턴스/오버레이는 반응형일 필요가 없다(kakao SDK 객체) — 일반 변수로 들고 재사용한다.
let mapInstance: any = null
let myLocationOverlay: any = null
let accuracyCircle: any = null
let hqOverlay: any = null

/** 현재 그려진 핀 — 원좌표를 함께 들고 있어야 줌이 바뀔 때 겹침 흩뿌리기를 다시 계산할 수 있다. */
type Pin = {
  key: string
  no: number
  lat: number
  lng: number
  el: HTMLElement
  overlay: any
}
let pins: Pin[] = []

function clearPins() {
  pins.forEach((p) => p.overlay.setMap(null))
  pins = []
}

/** 내 위치 파란 점 + 오차 반경 원을 (재)배치한다. pan=true면 지도를 그 지점으로 이동한다. */
function renderMyLocation(pan = false) {
  const kakao = (window as any).kakao
  const map = ensureMap(kakao)
  if (!map) return

  if (myLocationOverlay) {
    myLocationOverlay.setMap(null)
    myLocationOverlay = null
  }
  if (accuracyCircle) {
    accuracyCircle.setMap(null)
    accuracyCircle = null
  }
  const loc = props.myLocation
  if (!loc) return

  const position = new kakao.maps.LatLng(loc.lat, loc.lng)

  // 오차가 큰 웹(Wi-Fi/IP 추정)에서 점 하나만 찍으면 그 좌표가 정확한 줄 오해한다. 실제 오차
  // 반경을 원으로 같이 그려 "이 원 안 어딘가"라는 사실을 드러낸다.
  if (props.accuracyM && props.accuracyM > 150) {
    accuracyCircle = new kakao.maps.Circle({
      center: position,
      radius: props.accuracyM,
      strokeWeight: 1,
      strokeColor: '#266EFF',
      strokeOpacity: 0.7,
      strokeStyle: 'shortdash',
      fillColor: '#266EFF',
      fillOpacity: 0.08,
    })
    accuracyCircle.setMap(map)
  }

  myLocationOverlay = new kakao.maps.CustomOverlay({
    position,
    content:
      '<div style="position:relative;width:18px;height:18px;pointer-events:none;">' +
      '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(38,110,255,.25);animation:bb-pulse 1.8s ease-out infinite;"></div>' +
      '<div style="position:absolute;inset:4px;border-radius:50%;background:#266EFF;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>' +
      '</div>',
    map,
    zIndex: MY_LOCATION_Z,
  })
  if (pan) map.panTo(position)
}

/** mapEl에 지도 인스턴스가 없으면 새로 만들고, 있으면 그대로 재사용한다. */
function ensureMap(kakao: any): any {
  // `kakao.maps`는 스크립트 onload 직후부터 존재하지만, autoload=false라서 Map·LatLng 같은
  // 클래스는 `kakao.maps.load()` 콜백이 돌고 나서야 채워진다. 그 사이에 목록 응답이 도착해
  // watch(validPlaces)가 렌더를 부르면 "LatLng is not a constructor"로 터진다(실측). 그래서
  // 존재 여부가 아니라 **로드 완료**를 조건으로 삼는다.
  if (!mapEl.value || !sdkReady.value || !kakao?.maps?.LatLng) return null
  if (!mapInstance) {
    // 지도는 선택된 사업장(기본: 바텍네트웍스 본사)을 중심으로 연다. 장소가 오면 renderPins가 범위를 맞춘다.
    mapInstance = new kakao.maps.Map(mapEl.value, {
      center: new kakao.maps.LatLng(base.value.lat, base.value.lng),
      level: 4,
    })
    renderOfficeMarker(kakao, mapInstance)
    // 겹침 흩뿌리기는 화면 픽셀 기준이라 줌이 바뀌면 간격이 어긋난다 — 그때마다 다시 계산한다.
    kakao.maps.event.addListener(mapInstance, 'zoom_changed', () => spreadOverlappingPins(kakao, mapInstance))
    // 보정 모드에서 찍은 지점을 내 위치로 올려보낸다.
    kakao.maps.event.addListener(mapInstance, 'click', (e: any) => {
      if (!props.pickingLocation) return
      emit('pick', { lat: e.latLng.getLat(), lng: e.latLng.getLng() })
    })
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
    // 핀보다 아래. 사업장 이름표는 폭이 150px쯤이라 원형 여백으로는 다 못 피하는데,
    // 번호 핀이 라벨에 통째로 가려지면(실측: 6번) 바로 그 "목록과 지도가 다르다"는
    // 증상이 된다. 라벨은 맥락이고 번호 핀은 데이터라, 데이터를 위에 둔다.
    zIndex: OFFICE_Z,
  })
}

/**
 * 서로를 가리는 핀들을 원형으로 흩뿌려 번호가 전부 보이게 한다.
 *
 * 흩뿌리지 않으면 나중 번호 핀이 앞 번호를 그대로 덮어, 목록엔 1·2·3이 있는데 지도엔 5·7·8만
 * 보이는 것처럼 읽힌다(신고된 증상). 겹침 판정도 벌리는 간격도 **화면 픽셀** 기준이라
 * projection으로 좌표↔픽셀을 오간다 — 위경도로 판정하면 줌에 따라 기준이 달라지고, 반올림
 * 칸 경계에 걸친 "칸은 다른데 화면에선 겹치는" 쌍을 놓친다.
 *
 * 무게중심 기준으로 벌리므로 줌이 바뀔 때마다 원좌표에서 다시 계산해야 한다(누적 금지).
 */
function spreadOverlappingPins(kakao: any, map: any) {
  if (pins.length === 0) return
  const projection = map.getProjection?.()
  if (!projection?.containerPointFromCoords || !projection?.coordsFromContainerPoint) return

  // 원좌표 → 화면 픽셀. 겹침은 이 픽셀 좌표에서 푼다.
  // 번호 순으로 넣어야 미세 오프셋(황금각)이 늘 같은 순서로 걸려 배치가 재현된다.
  const points = [...pins]
    .sort((a, b) => a.no - b.no)
    .map((pin) => {
      const p = projection.containerPointFromCoords(new kakao.maps.LatLng(pin.lat, pin.lng))
      return { pin, x: p.x, y: p.y }
    })

  // 기준 사업장 마커(펄스 링 + 이름표)는 핀보다 훨씬 커서, 장애물로 넣지 않으면 그 뒤에
  // 핀이 통째로 숨는다(브라우저 검증에서 6번 핀이 라벨에 가려졌다).
  const officePoint = projection.containerPointFromCoords(
    new kakao.maps.LatLng(base.value.lat, base.value.lng)
  )
  const anchors = [{ x: officePoint.x, y: officePoint.y, radius: OFFICE_CLEARANCE_PX }]

  for (const placed of deOverlapPoints(points, { anchors })) {
    placed.item.pin.overlay.setPosition(
      projection.coordsFromContainerPoint(new kakao.maps.Point(placed.x, placed.y))
    )
  }
}

/** 사업장 마커·내 위치 점의 z축 — 둘 다 번호 핀보다 아래에 둔다. */
const OFFICE_Z = 1
const MY_LOCATION_Z = 2
/** 번호 핀의 z축 시작점 — 사업장 마커·내 위치 점보다 위. */
const PIN_Z_BASE = 10

/** 핀의 z축 순서 — 선택된 핀은 항상 맨 위, 나머지는 번호가 작을수록 위로. */
function pinZIndex(no: number, isSelected: boolean, total = pins.length): number {
  return isSelected ? PIN_Z_BASE + total + 1 : PIN_Z_BASE + (total - no)
}

/** 현재 validPlaces 기준으로 핀을 전부 지우고 다시 배치한다(번호 = 우측 목록 번호). */
function renderPins() {
  const kakao = (window as any).kakao
  const map = ensureMap(kakao)
  if (!map) return

  clearPins()
  if (validPlaces.value.length === 0) {
    map.setCenter(new kakao.maps.LatLng(base.value.lat, base.value.lng))
    map.setLevel(4)
    return
  }

  // 사업장 근처 장소가 있으면 사업장까지 한 화면에 담고, 먼 지역 검색이면 장소들만 담는다.
  const bounds = new kakao.maps.LatLngBounds()
  const nearHq = validPlaces.value.some(({ place }) => roughKm(place, base.value) <= HQ_INCLUDE_RADIUS_KM)
  if (nearHq) bounds.extend(new kakao.maps.LatLng(base.value.lat, base.value.lng))
  validPlaces.value.forEach(({ place }) => bounds.extend(new kakao.maps.LatLng(place.lat, place.lng)))
  // 내 위치도 화면 안에 넣는다. 예전엔 이게 빠져서, 내 위치를 잡은 직후 목록이 갱신되며 실행되는
  // setBounds가 앞선 panTo(내 위치)를 덮어써 지도가 사업장으로 되돌아갔다.
  if (props.myLocation) bounds.extend(new kakao.maps.LatLng(props.myLocation.lat, props.myLocation.lng))
  map.setBounds(bounds, 40)

  const total = validPlaces.value.length
  validPlaces.value.forEach(({ place, no, key }) => {
    const isSelected = props.selected === key
    const el = createPinEl(no, place.name, () => emit('select', key))
    setPinSelected(el, isSelected)
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(place.lat, place.lng),
      content: el,
      yAnchor: 1,
      xAnchor: 0.5,
      map,
      clickable: true,
      zIndex: pinZIndex(no, isSelected, total),
    })
    pins.push({ key, no, lat: place.lat, lng: place.lng, el, overlay })
  })

  spreadOverlappingPins(kakao, map)

  // 내 위치 점은 핀 목록과 별개로 유지한다(목록이 갈려도 사라지면 안 된다).
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
    sdkReady.value = true
    await nextTick() // showFallback=false일 때 mapEl이 DOM에 붙을 때까지 대기
    scriptFailed.value = false
    fallbackReason.value = ''
    renderPins()
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

// places.vue가 목록을 교체할 때마다 핀을 다시 배치한다(번호가 우측 리스트와 항상 일치하도록).
// 지도 인스턴스는 재사용한다.
watch(validPlaces, async () => {
  if (showFallback.value) return
  await nextTick()
  renderPins()
})

// 폴백으로 전환되면(유효한 장소가 0개) mapEl div가 v-if로 언마운트되므로, 다음에 다시
// 실지도로 돌아올 때 새 DOM 노드에 대해 지도를 새로 만들도록 인스턴스 참조를 정리한다.
watch(showFallback, (isFallback) => {
  if (isFallback) {
    mapInstance = null
    pins = []
    myLocationOverlay = null
    accuracyCircle = null
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

// 내 위치가 도착/갱신되면 파란 점·오차 원을 다시 그리고 그 지점으로 이동한다.
watch(
  () => props.myLocation,
  () => {
    if (showFallback.value) return
    renderMyLocation(true)
  }
)
watch(
  () => props.accuracyM,
  () => {
    if (showFallback.value) return
    renderMyLocation()
  }
)

/**
 * 목록에서 장소를 고르면 그 핀을 강조하고 지도를 그 지점으로 부드럽게 옮긴다.
 * 핀을 다시 그리지 않고 선택된/해제된 핀의 클래스와 z축만 갈아 끼운다(깜빡임 방지).
 */
watch(
  () => props.selected,
  (key) => {
    if (showFallback.value || !mapInstance) return
    for (const pin of pins) {
      const isSelected = pin.key === key
      setPinSelected(pin.el, isSelected)
      pin.overlay.setZIndex(pinZIndex(pin.no, isSelected))
    }
    const target = pins.find((p) => p.key === key)
    if (target) mapInstance.panTo(target.overlay.getPosition())
  }
)

// 보정 모드에서는 지도 커서를 십자로 바꿔 "여기를 찍으면 된다"를 드러낸다.
watch(
  () => props.pickingLocation,
  (on) => {
    if (mapEl.value) mapEl.value.style.cursor = on ? 'crosshair' : ''
  }
)
</script>

<template>
  <div class="map">
    <template v-if="!showFallback">
      <div ref="mapEl" class="map-canvas" />
      <div v-if="pickingLocation" class="pick-hint">지도를 눌러 내 위치를 직접 지정하세요</div>
    </template>

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
/* 내 위치 점·번호 핀은 카카오 SDK가 지도 내부 DOM으로 옮겨 붙이므로 scoped가 닿지 않는다.
   전역 스타일로 둔다. */
@keyframes bb-pulse {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(2.4); opacity: 0; }
}

/* 번호 핀 — 머리(숫자)만 자리를 차지하고 이름표는 절대배치라, 선택돼도 핀 끝점이 움직이지 않는다. */
.bb-pin { position: relative; width: 26px; height: 26px; cursor: pointer; }
.bb-pin-head {
  width: 26px; height: 26px; background: #E60012; border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg); display: flex; align-items: center; justify-content: center;
  box-shadow: 0 3px 8px rgba(181, 0, 14, .4);
  transition: width .14s ease, height .14s ease, margin .14s ease, background .14s ease;
}
.bb-pin-head span { transform: rotate(45deg); color: #fff; font-size: 12px; font-weight: 800; }
.bb-pin-name {
  display: none;
  position: absolute; top: 30px; left: 50%; transform: translateX(-50%);
  font-size: 11.5px; font-weight: 800; background: #fff; color: #221D15;
  border: 2px solid #B5000E; border-radius: 999px; padding: 3px 10px; white-space: nowrap;
  box-shadow: 0 4px 12px rgba(60, 48, 28, .25);
}
.bb-pin:hover .bb-pin-head { background: #B5000E; }
.bb-pin.is-selected .bb-pin-head {
  width: 38px; height: 38px; margin: -12px 0 0 -6px;
  background: #B5000E; border: 3px solid #fff; box-shadow: 0 6px 16px rgba(181, 0, 14, .55);
}
.bb-pin.is-selected .bb-pin-head span { font-size: 15px; }
.bb-pin.is-selected .bb-pin-name { display: block; }
</style>

<style scoped>
.map { flex: 1; min-height: 620px; background: #EFE9DC; border: 1px solid var(--line); border-radius: 4px; position: relative; overflow: hidden; }
.map-canvas { position: absolute; inset: 0; }
/* 보정 모드 안내 — 지도 위에 떠서 "지금 클릭이 위치 지정으로 쓰인다"를 알린다. */
.pick-hint {
  position: absolute; left: 50%; top: 14px; transform: translateX(-50%); z-index: 5;
  font-size: 12.5px; font-weight: 700; color: #fff; background: rgba(34, 29, 21, .88);
  border-radius: 999px; padding: 7px 16px; white-space: nowrap; pointer-events: none;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .3);
}
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
