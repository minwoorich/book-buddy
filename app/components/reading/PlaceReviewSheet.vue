<script setup lang="ts">
import type { Place, PlaceReviewDetail, PlaceReviewEntry, PlaceReviewSummary } from '#shared/types'
import { PLACE_TAGS, PLACE_TAG_EMOJI, PLACE_TAG_LABEL, type PlaceTagCode } from '#shared/constants/placeTags'
import { formatDistance, hasCoords, kakaoMapUrl } from '~/utils/place'
import { parseDbDate } from '~/utils/date'

/**
 * 한 장소의 후기를 모아 보는 시트 — PC는 가운데 모달, 모바일(≤640px)은 바텀시트.
 *
 * 예전에는 목록 카드 안에 후기가 통째로 붙어 있었다. 카드가 길어져 PC에선 한 화면에 두세 장밖에
 * 안 보였고, 코멘트는 최근 2건이 전부라 후기가 아무리 쌓여도 더 읽을 방법이 없었다.
 * 전체 후기는 여기로 옮기고, 카드에는 한 줄 신호만 남긴다.
 *
 * 탭이 둘인 이유: 사진은 "여기 읽기 좋은가"를 글보다 빨리 알려주는데, 후기 목록에 섞이면
 * 작게 흩어져 묻힌다. 저장은 후기에 딸린 채로 두고(주인이 분명하고 1인 1후기라 스팸이 안 쌓인다)
 * 보기만 갈라, 사진 후기 탭에서는 그리드로 크게 깐다.
 *
 * 생김새는 책 리뷰 목록(components/review/ReviewList.vue)의 규칙을 그대로 따른다 — 카드 채움 없이
 * 구분선 한 줄, 반경 3px, 액션은 밑줄 텍스트. 이 앱은 에디토리얼 톤이라 알약(999px)·분홍 채움·
 * 배지를 늘어놓으면 이 화면만 혼자 튄다.
 */
const props = defineProps<{ place: Place }>()
const emit = defineEmits<{ close: []; changed: [summary: PlaceReviewSummary] }>()

const api = useApi()

const COMMENT_MAX = 80
const IMAGE_MAX = 3
const IMAGE_BYTES_MAX = 8 * 1024 * 1024

type Tab = 'all' | 'photos'

const detail = ref<PlaceReviewDetail | null>(null)
const pending = ref(true)
const error = ref('')
const tab = ref<Tab>('all')

/** 사진 한 장과 그 사진이 딸린 후기 — 사진 탭 그리드와 라이트박스가 같은 목록을 쓴다. */
interface PhotoEntry {
  url: string
  review: PlaceReviewEntry
}

const photoEntries = computed<PhotoEntry[]>(() =>
  (detail.value?.reviews ?? []).flatMap((review) => review.images.map((url) => ({ url, review })))
)

/** 집계 한 줄 — 개수 많은 순. 부정 태그(시끄러워요)도 숨기지 않는다. */
const tagTally = computed(() => {
  const counts = detail.value?.tagCounts ?? {}
  return PLACE_TAGS.map((t) => ({ code: t.code, label: `${t.emoji} ${t.label}`, count: counts[t.code] ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
})

const mine = computed(() =>
  detail.value?.mineId ? (detail.value.reviews.find((r) => r.id === detail.value!.mineId) ?? null) : null
)

async function load() {
  pending.value = true
  error.value = ''
  try {
    detail.value = await api<PlaceReviewDetail>(`/api/place-reviews/${props.place.kakaoId}`)
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    pending.value = false
  }
}

onMounted(load)

function dateLabel(value: string): string {
  return parseDbDate(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

// ── 후기 쓰기 ──
const formOpen = ref(false)
const selectedTags = ref<PlaceTagCode[]>([])
const comment = ref('')
/** 수정 시 그대로 남길 기존 사진 경로. ×로 빼면 여기서 사라지고 저장할 때 파일까지 지워진다. */
const keepImages = ref<string[]>([])
/** 이번에 새로 고른 파일 — url은 미리보기용 objectURL이라 떼어낼 때 revoke해야 한다. */
const newImages = ref<{ file: File; url: string }[]>([])
const saving = ref(false)

const imageCount = computed(() => keepImages.value.length + newImages.value.length)

function revokeNewImages() {
  for (const img of newImages.value) URL.revokeObjectURL(img.url)
  newImages.value = []
}

function openForm() {
  selectedTags.value = [...(mine.value?.tags ?? [])]
  comment.value = mine.value?.comment ?? ''
  keepImages.value = [...(mine.value?.images ?? [])]
  revokeNewImages()
  formOpen.value = true
}

function closeForm() {
  revokeNewImages()
  formOpen.value = false
}

function toggleTag(code: PlaceTagCode) {
  selectedTags.value = selectedTags.value.includes(code)
    ? selectedTags.value.filter((c) => c !== code)
    : [...selectedTags.value, code]
}

/** 형식·용량은 고를 때 걸러준다 — 올리고 나서 실패하면 원인을 알기 어렵다(커뮤니티 글쓰기와 같은 기준). */
function addFiles(files: File[]) {
  const room = IMAGE_MAX - imageCount.value
  if (room <= 0) {
    alert(`사진은 최대 ${IMAGE_MAX}장까지예요`)
    return
  }
  if (files.length > room) alert(`사진은 최대 ${IMAGE_MAX}장까지예요`)
  for (const file of files.slice(0, room)) {
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.type)) {
      alert(`"${file.name}"은(는) 지원하지 않는 형식이에요. jpg·png·webp·gif만 올릴 수 있어요.`)
      continue
    }
    if (file.size > IMAGE_BYTES_MAX) {
      alert(`"${file.name}"이(가) 너무 커요(8MB 초과). 압축본으로 올려주세요.`)
      continue
    }
    newImages.value.push({ file, url: URL.createObjectURL(file) })
  }
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  target.value = '' // 같은 파일을 다시 고를 수 있도록 초기화
  addFiles(files)
}

function removeKeepImage(path: string) {
  keepImages.value = keepImages.value.filter((p) => p !== path)
}

function removeNewImage(index: number) {
  const [removed] = newImages.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
}

/** 저장·삭제 뒤: 시트 안 목록과 부모(목록·지도 카드)의 요약을 같이 새로 맞춘다. */
async function syncAfterWrite() {
  await load()
  const [fresh] = await api<PlaceReviewSummary[]>('/api/place-reviews', {
    query: { ids: props.place.kakaoId },
  })
  if (fresh) emit('changed', fresh)
}

async function save() {
  if (selectedTags.value.length === 0 || saving.value) return
  saving.value = true
  try {
    const body = new FormData()
    body.append('placeName', props.place.name)
    body.append('tags', JSON.stringify(selectedTags.value))
    body.append('comment', comment.value.trim())
    body.append('keepImages', JSON.stringify(keepImages.value))
    for (const img of newImages.value) body.append('image', img.file)

    await api(`/api/place-reviews/${props.place.kakaoId}`, { method: 'PUT', body })
    closeForm()
    await syncAfterWrite()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (saving.value || !confirm('내 후기를 삭제할까요? 올린 사진도 함께 지워져요.')) return
  saving.value = true
  try {
    await api(`/api/place-reviews/${props.place.kakaoId}`, { method: 'DELETE' })
    closeForm()
    await syncAfterWrite()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    saving.value = false
  }
}

// ── 라이트박스 ──
const lightbox = ref<number | null>(null)

function openLightbox(url: string) {
  const at = photoEntries.value.findIndex((p) => p.url === url)
  if (at >= 0) lightbox.value = at
}

function stepLightbox(delta: number) {
  if (lightbox.value === null) return
  const count = photoEntries.value.length
  lightbox.value = (lightbox.value + delta + count) % count
}

/** Esc는 위에 떠 있는 것부터 닫는다 — 라이트박스가 열려 있으면 시트는 그대로 둔다. */
function onKeydown(e: KeyboardEvent) {
  if (lightbox.value !== null) {
    if (e.key === 'Escape') lightbox.value = null
    else if (e.key === 'ArrowRight') stepLightbox(1)
    else if (e.key === 'ArrowLeft') stepLightbox(-1)
    return
  }
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  revokeNewImages()
})
</script>

<template>
  <div class="modal-back" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`${place.name} 후기`">
      <button type="button" class="close" aria-label="닫기" @click="emit('close')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      <div class="head">
        <div class="title">
          <b>{{ place.name }}</b>
          <span v-if="place.distanceM" class="dist">{{ formatDistance(place.distanceM) }}</span>
        </div>
        <p class="addr">{{ place.category }} · {{ place.address }}</p>
        <div v-if="tagTally.length" class="tag-badges tally">
          <span v-for="t in tagTally" :key="t.code" class="tag-badge">{{ t.label }} <b>{{ t.count }}</b></span>
        </div>
        <div v-if="hasCoords(place)" class="links">
          <a :href="kakaoMapUrl(place, 'map')" target="_blank" rel="noopener">카카오맵에서 보기</a>
          <a :href="kakaoMapUrl(place, 'to')" target="_blank" rel="noopener">길찾기</a>
        </div>
      </div>

      <!-- 후기 쓰기 -->
      <div v-if="formOpen" class="form">
        <div class="form-tags" role="group" aria-label="이 장소는 어땠나요">
          <button
            v-for="t in PLACE_TAGS"
            :key="t.code"
            type="button"
            class="chip"
            :class="{ on: selectedTags.includes(t.code) }"
            :aria-pressed="selectedTags.includes(t.code)"
            @click="toggleTag(t.code)"
          >{{ t.emoji }} {{ PLACE_TAG_LABEL[t.code] }}</button>
        </div>

        <div class="form-comment">
          <input v-model="comment" class="input" :maxlength="COMMENT_MAX" placeholder="한 줄 후기 (선택)" @keyup.enter="save">
          <span class="count">{{ comment.length }}/{{ COMMENT_MAX }}</span>
        </div>

        <div class="picker">
          <div v-for="path in keepImages" :key="path" class="thumb">
            <img :src="path" alt="">
            <button type="button" class="x-img" aria-label="사진 빼기" @click="removeKeepImage(path)">×</button>
          </div>
          <div v-for="(img, i) in newImages" :key="img.url" class="thumb">
            <img :src="img.url" alt="">
            <button type="button" class="x-img" aria-label="사진 빼기" @click="removeNewImage(i)">×</button>
          </div>
          <label v-if="imageCount < IMAGE_MAX" class="add-photo">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span>사진 {{ imageCount }}/{{ IMAGE_MAX }}</span>
            <input type="file" accept="image/*" multiple hidden @change="onFileChange">
          </label>
        </div>

        <div class="form-acts">
          <button type="button" class="btn sm" :disabled="saving" @click="closeForm">취소</button>
          <button type="button" class="btn sm primary" :disabled="saving || selectedTags.length === 0" @click="save">
            {{ saving ? '저장 중...' : '저장' }}
          </button>
        </div>
      </div>

      <template v-else>
        <div class="tabs">
          <span class="tab" :class="{ on: tab === 'all' }" @click="tab = 'all'">
            전체 후기 {{ detail?.total ?? 0 }}
          </span>
          <span
            class="tab"
            :class="{ on: tab === 'photos', off: photoEntries.length === 0 }"
            @click="photoEntries.length && (tab = 'photos')"
          >
            사진 후기 {{ photoEntries.length }}
          </span>
          <!-- 내 후기가 있으면 수정 진입점은 그 후기 줄에 둔다(목록 안에서 바로 고치는 게 자연스럽다). -->
          <button v-if="!mine" type="button" class="write" @click="openForm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
            후기 남기기
          </button>
        </div>

        <div class="body">
          <p v-if="pending" class="hint">불러오는 중…</p>
          <p v-else-if="error" class="hint">{{ error }}</p>

          <template v-else-if="tab === 'all'">
            <p v-if="!detail?.reviews.length" class="hint">
              아직 후기가 없어요 —
              <button type="button" class="hint-act" @click="openForm">첫 후기를 남겨보세요</button>
            </p>
            <div v-for="r in detail?.reviews ?? []" :key="r.id" class="row">
              <div class="who">
                <b>{{ r.userName }}</b>
                <span class="dept">{{ r.department }}</span>
                <span v-if="r.id === detail?.mineId" class="is-mine">내 후기</span>
                <span class="when">{{ dateLabel(r.updatedAt) }}</span>
              </div>
              <p v-if="r.comment" class="say">{{ r.comment }}</p>
              <div class="foot">
                <span class="tag-badges row-tags">
                  <span v-for="code in r.tags" :key="code" class="tag-badge">{{ PLACE_TAG_EMOJI[code] }} {{ PLACE_TAG_LABEL[code] }}</span>
                </span>
                <template v-if="r.id === detail?.mineId">
                  <button type="button" class="mini-act" @click="openForm">수정</button>
                  <button type="button" class="mini-act" :disabled="saving" @click="remove">삭제</button>
                </template>
              </div>
              <div v-if="r.images.length" class="row-photos">
                <button v-for="url in r.images" :key="url" type="button" class="row-photo" @click="openLightbox(url)">
                  <img :src="url" :alt="`${r.userName}님이 올린 사진`" loading="lazy">
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="grid">
              <button v-for="(p, i) in photoEntries" :key="`${p.review.id}-${i}`" type="button" class="cell" @click="lightbox = i">
                <img :src="p.url" :alt="`${p.review.userName}님이 올린 사진`" loading="lazy">
                <span class="cap">
                  <b>{{ p.review.userName }}</b>
                  <span v-if="p.review.tags[0]">{{ PLACE_TAG_EMOJI[p.review.tags[0]] }} {{ PLACE_TAG_LABEL[p.review.tags[0]] }}</span>
                </span>
              </button>
            </div>
            <p class="foot-note">사진을 누르면 크게 보고, 그 후기를 함께 읽을 수 있어요</p>
          </template>
        </div>
      </template>
    </div>

    <!-- 사진 원본 + 그 후기 전문. 시트 위에 다시 겹친다(Esc는 이쪽이 먼저 닫힌다). -->
    <div v-if="lightbox !== null && photoEntries[lightbox]" class="lb" @click.self="lightbox = null">
      <button type="button" class="lb-x" aria-label="닫기" @click="lightbox = null">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <button v-if="photoEntries.length > 1" type="button" class="lb-nav prev" aria-label="이전 사진" @click="stepLightbox(-1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <figure class="lb-fig" @click.stop>
        <img :src="photoEntries[lightbox]!.url" :alt="`${photoEntries[lightbox]!.review.userName}님이 올린 사진`">
        <figcaption>
          <div class="who">
            <b>{{ photoEntries[lightbox]!.review.userName }}</b>
            <span class="dept">{{ photoEntries[lightbox]!.review.department }}</span>
            <span class="when">{{ dateLabel(photoEntries[lightbox]!.review.updatedAt) }}</span>
            <span class="of">{{ lightbox + 1 }} / {{ photoEntries.length }}</span>
          </div>
          <div class="tag-badges row-tags">
            <span v-for="code in photoEntries[lightbox]!.review.tags" :key="code" class="tag-badge">{{ PLACE_TAG_EMOJI[code] }} {{ PLACE_TAG_LABEL[code] }}</span>
          </div>
          <p v-if="photoEntries[lightbox]!.review.comment" class="say">{{ photoEntries[lightbox]!.review.comment }}</p>
        </figcaption>
      </figure>
      <button v-if="photoEntries.length > 1" type="button" class="lb-nav next" aria-label="다음 사진" @click="stepLightbox(1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.modal-back {
  position: fixed; inset: 0; background: var(--overlay); z-index: 95;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
/*
 * ReaderProfileModal과 같은 세로 배치 규칙: 머리·탭은 flex: none으로 고정하고,
 * 남는 높이를 본문이 받아(min-height: 0) 그 안에서만 스크롤한다. 이게 없으면 후기가 많을 때
 * 탭 줄까지 같이 눌려 잘린다.
 */
.sheet {
  position: relative; width: 560px; max-width: 100%; max-height: 84vh; overflow: hidden;
  background: var(--card); border: 1px solid var(--line-strong); border-radius: 10px;
  padding: 22px 22px 8px; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px var(--shadow-strong);
}
.close { position: absolute; top: 12px; right: 12px; border: 0; background: none; color: var(--sub); cursor: pointer; padding: 4px; line-height: 0; }
.close:hover { color: var(--ink); }

.head { flex: none; padding-right: 30px; }
/* 이름이 길면 이름만 여러 줄로 흐르고 거리는 오른쪽에 붙어 있게 한다(목록 카드와 같은 규칙). */
.head .title { display: flex; align-items: baseline; gap: 10px; }
.head .title b { flex: 1; min-width: 0; font-size: 17px; }
.head .dist { flex: none; font-size: 12.5px; color: var(--red); font-weight: 700; }
.head .addr { margin: 4px 0 0; font-size: 12.5px; color: var(--sub); }
/* 집계 배지(전역 .tag-badge) — 시트에서는 자리가 넉넉하니 여러 줄로 흘러도 둔다. */
.tally { margin-top: 10px; }
.links { display: flex; gap: 14px; margin-top: 10px; }
.links a { font-size: 12.5px; font-weight: 700; color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 1px; }
.links a:hover { color: var(--red); border-color: var(--red); }

.tabs { flex: none; align-items: center; margin: 16px 0 0; }
.tabs .tab.off { color: var(--muted); cursor: default; }
/*
 * 시트 안의 다른 액션(수정·삭제, 카카오맵 링크)과 같은 결의 글자 버튼이다. 테두리 상자로 두면
 * 간편 모드에서 `.btn`이 44px로 부풀어 탭 줄을 밀어낸다.
 */
.tabs .write {
  margin-left: auto; align-self: center; display: inline-flex; align-items: center; gap: 4px;
  font: inherit; font-size: 12.5px; font-weight: 700; color: var(--red); cursor: pointer;
  background: none; border: 0; padding: 4px 2px;
}
.tabs .write:hover { text-decoration: underline; text-underline-offset: 3px; }

.body { flex: 1; min-height: 0; overflow-y: auto; margin: 0 -6px; padding: 4px 6px 14px; }
.hint { color: var(--sub); font-size: 13.5px; padding: 18px 2px; }
.hint-act { font: inherit; color: var(--red); font-weight: 700; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }

/* 후기 한 줄 — 책 리뷰 목록(ReviewList)과 같은 규칙: 채움 없이 구분선, 본문이 주인공. */
.row { padding: 15px 2px; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: 0; }
.row .who { display: flex; align-items: baseline; gap: 8px; }
.row .who b { font-size: 13.5px; }
.row .dept { font-size: 12.5px; color: var(--sub); }
/* 내 후기는 배지가 아니라 이름 옆 작은 글자로 표시한다 — 알록달록한 배지는 이 톤에 안 맞는다. */
.is-mine { font-size: 12px; color: var(--red); }
.row .when { margin-left: auto; font-size: 12px; color: var(--muted); flex: none; }
.row .say { margin: 5px 0 0; font-size: 14.5px; line-height: 1.6; color: var(--text-2); }
.row .foot { display: flex; align-items: center; gap: 10px; margin-top: 7px; }
.row-tags { flex: 1; min-width: 0; }
.mini-act { border: 0; background: none; font: inherit; font-size: 12px; color: var(--sub); cursor: pointer; padding: 0 2px; text-decoration: underline; flex: none; }
.mini-act:hover { color: var(--red); }
.mini-act:disabled { opacity: .5; cursor: default; }
.row-photos { display: flex; gap: 6px; margin-top: 9px; }
.row-photo { width: 78px; height: 78px; padding: 0; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; background: none; cursor: pointer; }
.row-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.row-photo:hover { border-color: var(--line-hover); }

/* 사진 후기 탭 — 사진을 크게 깔고, 설명은 사진 아래에 둔다(사진 위 그라데이션 덮개는 안 쓴다). */
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 10px; }
.cell { padding: 0; border: 0; background: none; cursor: pointer; text-align: left; }
.cell img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; border: 1px solid var(--line); border-radius: 3px; }
.cell:hover img { border-color: var(--line-hover); }
.cell .cap { display: flex; align-items: baseline; gap: 6px; margin-top: 5px; font-size: 12px; color: var(--sub); }
.cell .cap b { color: var(--ink); font-weight: 600; flex: none; }
.cell .cap span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.foot-note { margin: 16px 0 0; font-size: 12px; color: var(--muted); }

.form { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; margin-top: 16px; padding-bottom: 14px; }
.form-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.form-tags .chip { font-size: 12.5px; padding: 6px 12px; font-family: inherit; }
.form-comment { display: flex; align-items: center; gap: 8px; }
.form-comment .input { flex: 1; font-size: 13px; }
.form-comment .count { font-size: 11.5px; color: var(--sub); flex-shrink: 0; }
.picker { display: flex; flex-wrap: wrap; gap: 8px; }
.picker .thumb { position: relative; width: 84px; height: 84px; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; }
.picker .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.x-img {
  position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border: 0; border-radius: 50%;
  background: rgba(0, 0, 0, .6); color: #fff; font-size: 14px; line-height: 1; cursor: pointer;
}
.add-photo {
  width: 84px; height: 84px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  border: 1px dashed var(--line-strong); border-radius: 3px; color: var(--sub); font-size: 11.5px; cursor: pointer;
}
.add-photo:hover { border-color: var(--red); color: var(--red); }
.form-acts { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: auto; }

/* 라이트박스 — 시트(95) 위에 겹친다. */
.lb { position: fixed; inset: 0; z-index: 110; background: rgba(0, 0, 0, .86); display: flex; align-items: center; justify-content: center; padding: 24px; }
.lb-x { position: absolute; top: 14px; right: 16px; border: 0; background: none; color: #fff; cursor: pointer; padding: 6px; line-height: 0; }
.lb-nav { border: 0; background: rgba(255, 255, 255, .12); color: #fff; cursor: pointer; border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; flex: none; }
.lb-nav:hover { background: rgba(255, 255, 255, .24); }
.lb-fig { margin: 0 14px; max-width: 640px; max-height: 100%; display: flex; flex-direction: column; min-width: 0; }
.lb-fig img { max-width: 100%; max-height: 62vh; object-fit: contain; border-radius: 3px; background: #000; }
.lb-fig figcaption { margin-top: 12px; color: #fff; }
.lb-fig .who { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.lb-fig .dept, .lb-fig .when { color: rgba(255, 255, 255, .62); font-size: 12px; }
.lb-fig .of { margin-left: auto; font-size: 12px; color: rgba(255, 255, 255, .62); }
/* 어두운 바탕 위에서는 연한 빨강 배지가 안 보인다 — 반투명 흰색으로 바꿔 끼운다. */
.lb-fig .row-tags { margin-top: 7px; }
.lb-fig .tag-badge { color: #fff; background: rgba(255, 255, 255, .16); }
.lb-fig .tag-badge b { color: #fff; }
.lb-fig .say { margin: 8px 0 0; font-size: 13.5px; line-height: 1.6; color: rgba(255, 255, 255, .92); }

@media (max-width: 640px) {
  .modal-back { padding: 0; align-items: flex-end; }
  .sheet { max-height: 88vh; border-radius: 12px 12px 0 0; padding: 18px 14px 6px; }
  /* 좁은 화면에서는 2열 — 3열은 사진이 너무 작아 "크게 본다"는 목적이 사라진다. */
  .grid { grid-template-columns: repeat(2, 1fr); gap: 7px; }
  .row .when { margin-left: 0; }
  .lb { padding: 12px; }
  .lb-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; }
  .lb-nav.prev { left: 8px; }
  .lb-nav.next { right: 8px; }
  .lb-fig { margin: 0; }
  .lb-fig img { max-height: 54vh; }
}
</style>
