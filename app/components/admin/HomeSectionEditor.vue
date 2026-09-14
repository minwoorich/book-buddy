<script setup lang="ts">
import type { HomeSection } from '#shared/types'

const api = useApi()
const sections = ref<HomeSection[]>([])
const loading = ref(false)
const busyId = ref<number | null>(null)

async function load() {
  loading.value = true
  try {
    sections.value = await api<HomeSection[]>('/api/admin/home-sections')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function toggleEnabled(section: HomeSection) {
  if (busyId.value !== null) return
  busyId.value = section.id
  try {
    await api(`/api/admin/home-sections/${section.id}`, { method: 'PATCH', body: { enabled: !section.enabled } })
    await load()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busyId.value = null
  }
}

/** 인접 행과 sortOrder를 맞바꾼다(PATCH 2회). */
async function move(section: HomeSection, direction: -1 | 1) {
  if (busyId.value !== null) return
  const idx = sections.value.findIndex((s) => s.id === section.id)
  const targetIdx = idx + direction
  if (idx < 0 || targetIdx < 0 || targetIdx >= sections.value.length) return
  const target = sections.value[targetIdx]

  busyId.value = section.id
  try {
    await api(`/api/admin/home-sections/${section.id}`, { method: 'PATCH', body: { sortOrder: target.sortOrder } })
    await api(`/api/admin/home-sections/${target.id}`, { method: 'PATCH', body: { sortOrder: section.sortOrder } })
    await load()
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div>
    <p v-if="loading" class="hint">불러오는 중…</p>
    <p v-else-if="!sections.length" class="hint">섹션이 없어요.</p>
    <table v-else class="table">
      <tr v-for="(section, idx) in sections" :key="section.id">
        <td><b>{{ section.title }}</b></td>
        <td class="row-actions">
          <button type="button" class="btn sm" :disabled="idx === 0 || busyId !== null" @click="move(section, -1)">↑</button>
          <button
            type="button"
            class="btn sm"
            :disabled="idx === sections.length - 1 || busyId !== null"
            @click="move(section, 1)"
          >↓</button>
        </td>
        <td style="text-align:right;">
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
            <input
              type="checkbox"
              :checked="section.enabled"
              :disabled="busyId !== null"
              @change="toggleEnabled(section)"
            >
            노출
          </label>
        </td>
      </tr>
    </table>
  </div>
</template>

<style scoped>
.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }
</style>
