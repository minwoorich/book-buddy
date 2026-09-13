<script setup lang="ts">
defineProps<{
  status: 'available' | 'loaned'
  waitingCount?: number
}>()
</script>

<template>
  <span v-if="status === 'available'" class="st ok">● 대출가능</span>
  <span v-else class="st no">● 대출중<template v-if="waitingCount">&nbsp;· 예약 {{ waitingCount }}</template></span>
</template>
