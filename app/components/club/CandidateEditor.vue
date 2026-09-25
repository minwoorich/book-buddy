<script setup lang="ts">
import { kstIso, formatKst } from '#shared/utils/clubTime'

const props = defineProps<{ modelValue: string[]; max?: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const MAX = computed(() => props.max ?? 5)
/** 09:00~21:00, 30분 단위. */
const TIMES = Array.from({ length: 25 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`)

interface Row { date: string; time: string }
/** ISO → KST 날짜·시각 행. */
function toRow(iso: string): Row {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }
}
const rows = ref<Row[]>(props.modelValue.map(toRow))
function rowIso(r: Row): string { return r.date && r.time ? kstIso(r.date, r.time) : '' }
// 부모가 넘긴 값이 우리가 방금 emit한 값과 다를 때만 rows를 다시 만든다(에코 루프 방지).
watch(() => props.modelValue, (v) => {
  const current = rows.value.map(rowIso).filter(Boolean)
  if (v.join() !== current.join()) rows.value = v.map(toRow)
})

const error = computed(() => {
  const isos = rows.value.map(rowIso).filter(Boolean)
  if (isos.some((iso) => new Date(iso).getTime() <= Date.now())) return '지난 시간은 후보로 낼 수 없어요'
  if (new Set(isos).size !== isos.length) return '같은 시간이 두 번 있어요'
  return ''
})
function sync() { emit('update:modelValue', rows.value.map(rowIso).filter(Boolean)) }
function add() {
  if (rows.value.length >= MAX.value) return
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000)
  rows.value.push({ date: d.toISOString().slice(0, 10), time: '18:30' })
  sync()
}
function remove(i: number) { rows.value.splice(i, 1); sync() }
const today = computed(() => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10))
</script>

<template>
  <div class="cands">
    <div v-for="(r, i) in rows" :key="i" class="row">
      <input v-model="r.date" type="date" class="input date" :min="today" aria-label="날짜" @change="sync" />
      <select v-model="r.time" class="input time" aria-label="시각" @change="sync">
        <option v-for="t in TIMES" :key="t" :value="t">{{ t }}</option>
      </select>
      <span v-if="rowIso(r)" class="preview">{{ formatKst(rowIso(r)) }}</span>
      <button type="button" class="x" aria-label="후보 삭제" @click="remove(i)">×</button>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <button v-if="rows.length < MAX" type="button" class="btn sm add" @click="add">+ 시간 추가</button>
    <p v-else class="hint">후보는 {{ MAX }}개까지예요.</p>
  </div>
</template>

<style scoped>
.cands { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; }
.input { box-sizing: border-box; }
.date { width: 160px; }
.time { width: 96px; }
.preview { font-size: 13px; color: var(--sub); white-space: nowrap; }
.x { margin-left: auto; background: none; border: 0; font-size: 20px; line-height: 1; color: var(--muted); cursor: pointer; padding: 2px 6px; }
.x:hover { color: var(--red); }
.add { align-self: flex-start; }
.err { margin: 0; font-size: 13px; color: var(--red); }
.hint { margin: 0; font-size: 12.5px; color: var(--muted); }
@media (max-width: 640px) {
  .row { flex-wrap: wrap; }
  .preview { width: 100%; }
}
</style>
