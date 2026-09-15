<script setup lang="ts">
import type { Place, PlaceReviewSummary } from '#shared/types'
import { PLACE_TAGS, PLACE_TAG_LABEL, type PlaceTagCode } from '#shared/constants/placeTags'

const props = defineProps<{
  place: Place
  /** 목록 화면이 일괄 조회해 넘긴 요약. 아직 안 왔으면 null. */
  summary: PlaceReviewSummary | null
}>()
const emit = defineEmits<{ changed: [summary: PlaceReviewSummary] }>()

const api = useApi()

const open = ref(false)
const selected = ref<PlaceTagCode[]>([])
const comment = ref('')
const saving = ref(false)

const COMMENT_MAX = 80
const TOP_TAGS = 3

/** 집계 칩: 많은 순 최대 3개. 동률은 태그 정의 순서. */
const topTags = computed(() => {
  const counts = props.summary?.tagCounts ?? {}
  return PLACE_TAGS.map((t) => ({ code: t.code, label: t.label, count: counts[t.code] ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TAGS)
})

const hasMine = computed(() => Boolean(props.summary?.mine))

function openForm() {
  selected.value = [...(props.summary?.mine?.tags ?? [])]
  comment.value = props.summary?.mine?.comment ?? ''
  open.value = true
}

function toggle(code: PlaceTagCode) {
  selected.value = selected.value.includes(code)
    ? selected.value.filter((c) => c !== code)
    : [...selected.value, code]
}

/** 저장/삭제 뒤 이 장소 요약만 다시 받아 부모에 올리고 접는다. */
async function refresh() {
  const [summary] = await api<PlaceReviewSummary[]>('/api/place-reviews', {
    query: { ids: props.place.kakaoId },
  })
  if (summary) emit('changed', summary)
  open.value = false
}

async function save() {
  if (selected.value.length === 0 || saving.value) return
  saving.value = true
  try {
    await api(`/api/place-reviews/${props.place.kakaoId}`, {
      method: 'PUT',
      body: { placeName: props.place.name, tags: selected.value, comment: comment.value.trim() },
    })
    await refresh()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (saving.value || !confirm('내 후기를 삭제할까요?')) return
  saving.value = true
  try {
    await api(`/api/place-reviews/${props.place.kakaoId}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- 카카오 id가 없는 장소(폴백 예시)는 후기를 붙일 키가 없다 -->
  <div v-if="place.kakaoId" class="prv">
    <div v-if="!open" class="prv-summary">
      <div class="prv-line">
        <template v-if="summary && summary.total > 0">
          <span v-for="t in topTags" :key="t.code" class="tally">{{ t.label }} <b>{{ t.count }}</b></span>
          <span class="total">후기 {{ summary.total }}</span>
        </template>
        <span v-else class="empty">아직 후기가 없어요 — 첫 후기를 남겨보세요</span>
        <button type="button" class="prv-open" @click="openForm">{{ hasMine ? '내 후기 수정' : '후기 남기기' }}</button>
      </div>
      <ul v-if="summary && summary.recent.length" class="prv-recent">
        <li v-for="r in summary.recent" :key="r.id">
          <span class="q">"{{ r.comment }}"</span>
          <span class="who">— {{ r.userName }} · {{ r.department }}</span>
        </li>
      </ul>
    </div>

    <div v-else class="prv-form">
      <div class="prv-tags" role="group" aria-label="이 장소는 어땠나요">
        <button
          v-for="t in PLACE_TAGS"
          :key="t.code"
          type="button"
          class="chip"
          :class="{ on: selected.includes(t.code) }"
          :aria-pressed="selected.includes(t.code)"
          @click="toggle(t.code)"
        >{{ PLACE_TAG_LABEL[t.code] }}</button>
      </div>
      <div class="prv-comment">
        <input
          v-model="comment"
          class="input"
          :maxlength="COMMENT_MAX"
          placeholder="한 줄 후기 (선택)"
          @keyup.enter="save"
        >
        <span class="count">{{ comment.length }}/{{ COMMENT_MAX }}</span>
      </div>
      <div class="prv-acts">
        <button v-if="hasMine" type="button" class="danger" :disabled="saving" @click="remove">삭제</button>
        <button type="button" class="btn sm" :disabled="saving" @click="open = false">취소</button>
        <button type="button" class="btn sm primary" :disabled="saving || selected.length === 0" @click="save">
          {{ saving ? '저장 중...' : '저장' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prv { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
.prv-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
.tally { color: var(--ink); background: var(--hover); border-radius: 999px; padding: 3px 9px; }
.tally b { color: var(--red); font-weight: 700; margin-left: 2px; }
.total { color: var(--sub); }
.empty { color: var(--sub); }
.prv-open { margin-left: auto; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--red); background: none; border: 0; padding: 0; cursor: pointer; }
.prv-open:hover { text-decoration: underline; }
.prv-recent { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.prv-recent .q { color: var(--ink); }
.prv-recent .who { color: var(--sub); margin-left: 6px; }

.prv-form { display: flex; flex-direction: column; gap: 10px; }
.prv-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.prv-tags .chip { font-size: 12.5px; padding: 5px 11px; font-family: inherit; }
.prv-comment { display: flex; align-items: center; gap: 8px; }
.prv-comment .input { flex: 1; font-size: 13px; }
.prv-comment .count { font-size: 11.5px; color: var(--sub); flex-shrink: 0; }
.prv-acts { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
.prv-acts .danger { margin-right: auto; font: inherit; font-size: 12.5px; color: var(--sub); background: none; border: 0; padding: 0; cursor: pointer; }
.prv-acts .danger:hover { color: var(--red); }
</style>
