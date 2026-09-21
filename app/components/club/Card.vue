<script setup lang="ts">
import type { Club } from '#shared/types'
import { formatKst } from '#shared/utils/clubTime'

const props = defineProps<{ club: Club; showDeadline?: boolean }>()

/** 응답(초대)·투표 마감까지 남은 일수. 지났거나 없으면 null. */
const daysLeft = computed(() => {
  const until = props.club.status === 'scheduling' ? props.club.voteExpiresAt : props.club.inviteExpiresAt
  if (!until) return null
  const diff = new Date(until).getTime() - Date.now()
  return diff <= 0 ? null : Math.ceil(diff / (24 * 60 * 60 * 1000))
})

const statusLabel = computed(() => {
  switch (props.club.status) {
    case 'inviting': return '응답 대기'
    case 'scheduling': return '시간 조율 중'
    case 'confirmed': return '확정'
    case 'done': return '종료'
    case 'canceled': return '취소됨'
    default: return ''
  }
})
</script>

<template>
  <NuxtLink class="card" :to="`/clubs/${club.id}`">
    <img v-if="club.bookCoverUrl" class="cover" :src="club.bookCoverUrl" :alt="club.bookTitle" />
    <div class="body">
      <strong class="title">『{{ club.bookTitle }}』</strong>
      <p class="meta">
        {{ club.members.length }}명
        <span class="sep">·</span>{{ statusLabel }}
        <span v-if="(showDeadline || club.status === 'scheduling') && daysLeft !== null" class="dday">D-{{ daysLeft }}</span>
      </p>
      <p v-if="club.meetAt" class="when">{{ formatKst(club.meetAt) }}<span v-if="club.place"> · {{ club.place.name }}</span></p>
      <p v-else-if="club.status === 'canceled' && club.canceledReason" class="why">{{ club.canceledReason }}</p>
    </div>
  </NuxtLink>
</template>

<style scoped>
.card { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--line, #eee); border-radius: 10px; text-decoration: none; color: inherit; }
.cover { width: 44px; height: 62px; object-fit: cover; border-radius: 4px; flex: none; }
.body { min-width: 0; }
.title { display: block; font-size: 15px; }
.meta { margin: 4px 0 0; font-size: 13px; color: var(--muted, #666); }
.sep { margin: 0 4px; }
.dday { margin-left: 6px; color: #e60012; font-weight: 600; }
.when, .why { margin: 4px 0 0; font-size: 13px; }
.why { color: var(--muted, #888); }
</style>
