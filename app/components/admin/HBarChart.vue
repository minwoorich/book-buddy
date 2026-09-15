<script setup lang="ts">
const props = defineProps<{
  rows: { label: string; value: number; sub?: string }[]
}>()

const GRID_LINES = [25, 50, 75, 100]

const max = computed(() => Math.max(0, ...props.rows.map((r) => r.value)))

function barWidth(value: number): number {
  if (max.value <= 0) return 0
  return Math.round((value / max.value) * 100)
}
</script>

<template>
  <p v-if="!rows.length" class="hint">데이터가 없어요</p>
  <div v-else class="hbar-chart">
    <template v-for="row in rows" :key="row.label">
      <span class="cat">{{ row.label }}</span>
      <div class="track">
        <span v-for="g in GRID_LINES" :key="g" class="grid-line" :style="{ left: g + '%' }" />
        <div class="bar" :style="{ width: barWidth(row.value) + '%' }" />
      </div>
      <span class="val">{{ row.value }}권 <span v-if="row.sub">· {{ row.sub }}</span></span>
    </template>
  </div>
</template>

<style scoped>
.hbar-chart { display: grid; grid-template-columns: minmax(90px, 170px) 1fr 110px; row-gap: 13px; align-items: center; }
/* "바텍이우홀딩스 · 경영지원본부"처럼 긴 라벨은 낱말 중간이 아니라 구분점에서만 줄바꿈 */
.hbar-chart .cat { font-size: 13px; color: var(--sub); text-align: right; padding-right: 14px; word-break: keep-all; line-height: 1.3; }
.hbar-chart .track { position: relative; height: 18px; }
.hbar-chart .grid-line { position: absolute; top: -6px; bottom: -6px; width: 1px; background: var(--line); }
.hbar-chart .bar { position: absolute; top: 0; bottom: 0; left: 0; background: var(--accent-data); border-radius: 0 4px 4px 0; }
.hbar-chart .track:hover .bar { background: var(--accent-data-dark); }
.hbar-chart .val { font-size: 13px; color: var(--ink); padding-left: 12px; }
.hbar-chart .val span { color: var(--sub); font-size: 12px; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

/* 모바일: 좁은 열에서 "바텍 · 개…"처럼 잘려 구분이 안 되던 라벨을 막대 위 한 줄로 올린다 */
@media (max-width: 640px) {
  .hbar-chart { grid-template-columns: 1fr 74px; row-gap: 5px; }
  .hbar-chart .cat { grid-column: 1 / -1; text-align: left; padding: 0; font-size: 12px; margin-top: 9px; }
  .hbar-chart .cat:first-child { margin-top: 0; }
  .hbar-chart .val { font-size: 12px; padding-left: 8px; white-space: nowrap; }
  .hbar-chart .val span { display: none; }
}
</style>
