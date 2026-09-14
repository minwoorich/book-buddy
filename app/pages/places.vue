<script setup lang="ts">
import type { Place } from '#shared/types'

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

// places.html의 고정 예시 4곳. 카카오 로컬 검색 키가 없어 GET /api/places가 503을 내는
// 상황(또는 로그인 전 SSR)에서 정적 폴백으로 그대로 보여준다. address 필드는 실제 API
// 결과에선 도로명 주소가 들어가지만, 여기선 목업과 동일하게 운영시간/메모 텍스트를 담는다.
const FALLBACK_PLACES: PlaceWithReason[] = [
  {
    name: '카페 온점',
    category: '카페 · 도보 4분',
    address: '평일 9:00–21:00 · 콘센트 좌석 많음',
    mapx: 0,
    mapy: 0,
    lat: 0,
    lng: 0,
    reason: '창가 1인석이 많고 음악이 잔잔해서 점심시간 독서에 가장 좋아요.',
  },
  {
    name: '수지도서관',
    category: '도서관 · 차 7분',
    address: '화–일 9:00–22:00 · 열람실 예약 가능',
    mapx: 0,
    mapy: 0,
    lat: 0,
    lng: 0,
    reason: '집중해서 완독하고 싶은 날, 퇴근 후 2시간 몰입 코스로 추천해요.',
  },
  {
    name: '동천 공원',
    category: '공원 · 도보 9분',
    address: '벤치 다수 · 그늘 많음',
    mapx: 0,
    mapy: 0,
    lat: 0,
    lng: 0,
    reason: '요즘 날씨에 가볍게 읽기 좋아요. 에세이·인문 책과 잘 어울립니다.',
  },
  {
    name: '북카페 서재',
    category: '북카페 · 차 5분',
    address: '평일 11:00–23:00 · 조용한 룸 2개',
    mapx: 0,
    mapy: 0,
    lat: 0,
    lng: 0,
    reason: '팀 북클럽 모임 장소로 좋아요. 룸 예약이 가능해서 토론하기 편합니다.',
  },
]

const { data: fetchedPlaces } = await useAsyncData<Place[]>(
  'places',
  () => (user.value ? api<Place[]>('/api/places') : Promise.resolve([])),
  { default: () => [] }
)

// 실제 검색 결과가 하나도 없으면(키 미설정으로 503이거나, 로그인 전 SSR) 예시로 대체한다.
const isFallback = computed(() => (fetchedPlaces.value ?? []).length === 0)

/** AI 추천 요청에 보낼 원본 장소 목록. */
const basePlaces = computed<Place[]>(() => (isFallback.value ? FALLBACK_PLACES : fetchedPlaces.value ?? []))

const ranked = ref<PlaceWithReason[] | null>(null)
const aiLoading = ref(false)

const displayList = computed<PlaceWithReason[]>(() => {
  if (ranked.value) return ranked.value
  if (isFallback.value) return FALLBACK_PLACES
  return basePlaces.value.map((p) => ({ ...p, reason: '' }))
})

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
      <div class="page-head" style="display:flex; align-items:flex-end; gap: 20px;">
        <div>
          <span class="eyebrow">READING SPOTS</span>
          <h1>책 읽기 좋은 장소</h1>
          <p>회사 주변 카페·도서관·공원을 AI가 책 읽기 좋은 순으로 골라드려요</p>
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

      <p v-if="isFallback" class="hint">장소 검색을 사용할 수 없어 예시 장소를 보여드려요.</p>

      <div class="pl-layout">
        <CommonKakaoMap :places="displayList" :app-key="kakaoJsKey" />

        <div class="plist">
          <div v-for="(place, i) in displayList" :key="place.name" class="place">
            <div class="top">
              <span class="no">{{ i + 1 }}</span>
              <b>{{ place.name }}</b>
              <span class="cat">{{ place.category }}</span>
              <span v-if="isFallback" class="badge no" style="margin-left:auto;">예시</span>
            </div>
            <div class="meta">{{ place.address }}</div>
            <div v-if="place.reason" class="why">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5000E" stroke-width="2" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"></path></svg>
              {{ place.reason }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pl-layout { display: flex; gap: 26px; align-items: stretch; }

.plist { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }
.place { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 16px 18px; box-shadow: 0 2px 10px rgba(84,70,45,.06); }
.place .top { display: flex; align-items: baseline; gap: 9px; margin-bottom: 4px; }
.place .no { font-family: "Noto Serif KR", serif; color: var(--red); font-weight: 700; font-size: 16px; }
.place b { font-size: 15.5px; }
.place .cat { font-size: 12px; color: var(--sub); }
.place .meta { font-size: 12.5px; color: var(--sub); margin-bottom: 10px; }
.place .why { background: var(--red-tint); border-radius: 3px; padding: 9px 12px; font-size: 13px; line-height: 1.6; color: #6E3A34; display: flex; gap: 8px; }
.place .why svg { flex-shrink: 0; margin-top: 2px; }

.hint { color: var(--sub); font-size: 14px; margin: -18px 0 20px; }
</style>
