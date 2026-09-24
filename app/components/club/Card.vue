<script setup lang="ts">
import type { Club } from '#shared/types'
import { formatKst } from '#shared/utils/clubTime'
import { clubTitle } from '#shared/utils/clubTitle'

const props = defineProps<{ club: Club; showDeadline?: boolean; recruit?: boolean }>()
const { user } = useCurrentUser()

const title = computed(() => clubTitle(props.club))
const accepted = computed(() => props.club.members.filter((m) => m.inviteStatus === 'accepted'))
// 정원이 "찼는지"는 초대로 잡아둔 자리까지 세야 서버(clubRecruitService)의 판정과 맞는다(카드는 발견용 진입점).
const reserved = computed(() => props.club.members.filter((m) => m.inviteStatus === 'accepted' || m.inviteStatus === 'invited'))
const completedCount = computed(() => accepted.value.filter((m) => m.completed).length)
const readingCount = computed(() => accepted.value.filter((m) => m.reading).length)
const host = computed(() => props.club.members.find((m) => m.role === 'host'))

/** 응답(초대)·투표·모집 마감까지 남은 일수. 지났거나 없으면 null. */
const daysLeft = computed(() => {
  const until =
    props.club.status === 'scheduling' ? props.club.voteExpiresAt
    : props.club.origin === 'user' ? props.club.recruitUntil
    : props.club.inviteExpiresAt
  if (!until) return null
  const diff = new Date(until).getTime() - Date.now()
  return diff <= 0 ? null : Math.ceil(diff / (24 * 60 * 60 * 1000))
})

const statusLabel = computed(() => {
  switch (props.club.status) {
    case 'inviting': return props.club.origin === 'user' ? '모집 중' : '응답 대기'
    case 'scheduling': return '시간 조율 중'
    case 'confirmed': return '확정'
    case 'done': return '종료'
    case 'canceled': return '취소됨'
    default: return ''
  }
})

/** 모집 카드에서 나의 관계 — 버튼이 아니라 라벨(참여는 상세에서). */
const myLabel = computed(() => {
  const me = props.club.members.find((m) => m.userId === user.value?.id)
  if (me?.role === 'host') return '내 모임'
  if (me?.inviteStatus === 'accepted') return '참여 중'
  if (me?.inviteStatus === 'invited') return '초대받음'
  return reserved.value.length >= props.club.capacity ? '정원 마감' : '참여할 수 있어요'
})
</script>

<template>
  <NuxtLink class="card" :to="`/clubs/${club.id}`">
    <img v-if="club.bookCoverUrl" class="cover" :src="club.bookCoverUrl" :alt="club.bookTitle" />
    <div class="body">
      <strong class="title">{{ title }}</strong>
      <p v-if="club.origin === 'user'" class="sub">『{{ club.bookTitle }}』<span v-if="host" class="sep">·</span>{{ host?.userName }} {{ host?.department }}</p>
      <p class="meta">
        <template v-if="recruit">{{ accepted.length }}/{{ club.capacity }}명</template>
        <template v-else>{{ club.members.length }}명</template>
        <span class="sep">·</span>{{ statusLabel }}
        <span v-if="(showDeadline || recruit || club.status === 'scheduling') && daysLeft !== null" class="dday">D-{{ daysLeft }}</span>
        <template v-if="recruit && completedCount > 0"><span class="sep">·</span>완독 {{ completedCount }}</template>
        <template v-if="recruit && readingCount > 0"><span class="sep">·</span>읽는 중 {{ readingCount }}</template>
      </p>
      <p v-if="recruit && club.description" class="desc">{{ club.description }}</p>
      <p v-if="recruit" class="mine">{{ myLabel }}</p>
      <p v-else-if="club.meetAt" class="when">{{ formatKst(club.meetAt) }}<span v-if="club.place"> · {{ club.place.name }}</span></p>
      <p v-else-if="club.status === 'canceled' && club.canceledReason" class="why">{{ club.canceledReason }}</p>
    </div>
  </NuxtLink>
</template>

<style scoped>
.card { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--line, #eee); border-radius: 10px; text-decoration: none; color: inherit; }
.cover { width: 44px; height: 62px; object-fit: cover; border-radius: 4px; flex: none; }
.body { min-width: 0; }
.title { display: block; font-size: 15px; }
.sub { margin: 2px 0 0; font-size: 13px; color: var(--muted, #666); }
.meta { margin: 4px 0 0; font-size: 13px; color: var(--muted, #666); }
.sep { margin: 0 4px; }
.dday { margin-left: 6px; color: var(--red); font-weight: 600; }
.desc { margin: 4px 0 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mine { margin: 4px 0 0; font-size: 13px; color: var(--red); font-weight: 600; }
.when, .why { margin: 4px 0 0; font-size: 13px; }
.why { color: var(--muted, #888); }
</style>
