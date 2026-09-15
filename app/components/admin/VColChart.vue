<script setup lang="ts">
const props = defineProps<{
  rows: { label: string; value: number }[]
}>()

const max = computed(() => Math.max(0, ...props.rows.map((r) => r.value)))

function colHeight(value: number): number {
  if (max.value <= 0) return 0
  return Math.round((value / max.value) * 100)
}
</script>

<template>
  <p v-if="!rows.length" class="hint">데이터가 없어요</p>
  <template v-else>
    <div class="vcol-chart">
      <div v-for="row in rows" :key="row.label" class="vcol">
        <span class="num">{{ row.value }}</span>
        <div class="col" :style="{ height: colHeight(row.value) + '%' }" />
      </div>
    </div>
    <div class="vcol-cats">
      <span v-for="row in rows" :key="row.label">{{ row.label }}</span>
    </div>
  </template>
</template>

<style scoped>
.vcol-chart { display: flex; align-items: flex-end; gap: 26px; height: 170px; padding: 0 10px; border-bottom: 1px solid var(--line-strong); }
.vcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; }
.vcol .num { font-size: 12.5px; color: var(--ink); }
.vcol .col { width: 26px; background: var(--accent-data); border-radius: 4px 4px 0 0; }
.vcol:hover .col { background: var(--accent-data-dark); }
.vcol-cats { display: flex; gap: 26px; padding: 8px 10px 0; }
.vcol-cats span { flex: 1; text-align: center; font-size: 12.5px; color: var(--sub); }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 640px) {
  .vcol-chart { gap: 10px; height: 140px; padding: 0 4px; }
  .vcol .col { width: 20px; }
  .vcol-cats { gap: 10px; padding: 8px 4px 0; }
  .vcol-cats span { font-size: 11.5px; }
}
</style>
