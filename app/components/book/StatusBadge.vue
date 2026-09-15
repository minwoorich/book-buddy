<script setup lang="ts">
defineProps<{
  status: 'available' | 'loaned'
  waitingCount?: number
}>()

// 색약 모드에서는 색(초록/회색) 대신 기호(✓/✕)로 상태를 구분한다.
const { prefs } = useA11y()
const mark = computed(() => (prefs.value.cvd ? { ok: '✓', no: '✕' } : { ok: '●', no: '●' }))
</script>

<template>
  <span v-if="status === 'available'" class="st ok">{{ mark.ok }} 대출가능</span>
  <span v-else class="st no">{{ mark.no }} 대출중<template v-if="waitingCount">&nbsp;· 예약 {{ waitingCount }}</template></span>
</template>
