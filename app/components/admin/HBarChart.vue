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
.hbar-chart { display: grid; grid-template-columns: 90px 1fr 110px; row-gap: 13px; align-items: center; }
.hbar-chart .cat { font-size: 13px; color: var(--sub); text-align: right; padding-right: 14px; }
.hbar-chart .track { position: relative; height: 18px; }
.hbar-chart .grid-line { position: absolute; top: -6px; bottom: -6px; width: 1px; background: var(--line); }
.hbar-chart .bar { position: absolute; top: 0; bottom: 0; left: 0; background: var(--red); border-radius: 0 4px 4px 0; }
.hbar-chart .track:hover .bar { background: var(--red-dark); }
.hbar-chart .val { font-size: 13px; color: var(--ink); padding-left: 12px; }
.hbar-chart .val span { color: var(--sub); font-size: 12px; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }
</style>
